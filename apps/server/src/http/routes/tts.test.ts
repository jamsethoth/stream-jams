import type { TtsProviderDescriptor, TtsProviderTestInput, TtsProviderTestResult, TtsService } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("tts routes", () => {
  it("lists provider capabilities and runs management-protected test actions", async () => {
    const { app, authHeaders, ttsService } = await createAppWithTts();

    const listResponse = await app.inject({
      method: "GET",
      url: "/tts/providers",
      headers: authHeaders
    });
    const testResponse = await app.inject({
      method: "POST",
      url: "/tts/test",
      headers: authHeaders,
      payload: {
        providerId: "browser-speech",
        text: "Sample cheer from Viewer"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        id: "browser-speech",
        label: "Browser Speech",
        capabilities: {
          supportsVoices: false,
          supportsRate: true,
          supportsPitch: true,
          supportsVolume: true,
          playbackMode: "browser-speech"
        },
        voices: []
      }
    ]);
    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      instruction: {
        mode: "browser-speech",
        text: "Sample cheer from Viewer",
        audioAssetId: null,
        providerPayload: {
          providerId: "browser-speech"
        }
      },
      moderationActions: []
    });
    expect(ttsService.testRequests).toMatchObject([
      {
        providerId: "browser-speech",
        text: "Sample cheer from Viewer"
      }
    ]);
  });

  it("returns 400 for invalid provider options", async () => {
    const { app, authHeaders } = await createAppWithTts({
      testProviderError: createTtsError("UNSUPPORTED_TTS_OPTION", "TTS provider \"browser-speech\" does not support voice option \"voice-1\"")
    });

    const response = await app.inject({
      method: "POST",
      url: "/tts/test",
      headers: authHeaders,
      payload: {
        providerId: "browser-speech",
        text: "hello",
        voiceId: "voice-1"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "UNSUPPORTED_TTS_OPTION",
        message: "TTS provider \"browser-speech\" does not support voice option \"voice-1\""
      }
    });
  });

  it("returns a controlled 502 response for provider failures", async () => {
    const { app, authHeaders } = await createAppWithTts({
      testProviderError: createTtsError("TTS_PROVIDER_FAILURE", "TTS provider \"browser-speech\" failed to create a playback instruction")
    });

    const response = await app.inject({
      method: "POST",
      url: "/tts/test",
      headers: authHeaders,
      payload: {
        providerId: "browser-speech",
        text: "hello"
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TTS_PROVIDER_FAILURE",
        message: "TTS provider \"browser-speech\" failed to create a playback instruction"
      }
    });
  });

  it("rejects missing management sessions and overlay route keys before TTS work", async () => {
    const { app, ttsService } = await createAppWithTts();

    const missingSession = await app.inject({
      method: "GET",
      url: "/tts/providers"
    });
    const overlayKey = await app.inject({
      method: "POST",
      url: "/tts/test",
      headers: {
        authorization: "Bearer ovl_not-management"
      },
      payload: {
        providerId: "browser-speech",
        text: "hello"
      }
    });

    expect(missingSession.statusCode).toBe(401);
    expect(overlayKey.statusCode).toBe(401);
    expect(ttsService.listCount).toBe(0);
    expect(ttsService.testRequests).toEqual([]);
  });
});

function createTtsError(code: string, message: string): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

async function createAppWithTts(options: { readonly testProviderError?: Error | undefined } = {}) {
  const ttsService = new RecordingTtsService(options);
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => "mgmt_tts-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    ttsService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    ttsService,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

class RecordingTtsService implements Pick<TtsService, "listProviders" | "testProvider"> {
  listCount = 0;
  readonly testRequests: TtsProviderTestInput[] = [];
  readonly #testProviderError: Error | undefined;

  constructor(options: { readonly testProviderError?: Error | undefined }) {
    this.#testProviderError = options.testProviderError;
  }

  async listProviders(): Promise<readonly TtsProviderDescriptor[]> {
    this.listCount += 1;
    return [
      {
        id: "browser-speech",
        label: "Browser Speech",
        capabilities: {
          supportsVoices: false,
          supportsRate: true,
          supportsPitch: true,
          supportsVolume: true,
          playbackMode: "browser-speech"
        },
        voices: []
      }
    ];
  }

  async testProvider(input: TtsProviderTestInput): Promise<TtsProviderTestResult> {
    this.testRequests.push(input);
    if (this.#testProviderError !== undefined) {
      throw this.#testProviderError;
    }

    return {
      instruction: {
        mode: "browser-speech",
        text: input.text,
        audioAssetId: null,
        providerPayload: {
          providerId: input.providerId,
          voiceId: input.voiceId ?? null
        }
      },
      moderationActions: []
    };
  }
}
