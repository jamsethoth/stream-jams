import { describe, expect, it } from "vitest";
import { DefaultModerationService } from "../moderation/moderation-service.js";
import type { TtsProvider, TtsProviderPlaybackInput, TtsProviderRegistry } from "./tts-provider.js";
import {
  DefaultTtsService,
  TtsProviderFailureError,
  UnknownTtsProviderError
} from "./tts-service.js";

describe("DefaultTtsService", () => {
  it("lists provider capabilities and voices", async () => {
    const service = createService({
      providers: [
        createProvider({
          id: "voice-provider",
          capabilities: {
            supportsVoices: true,
            supportsRate: true,
            supportsPitch: false,
            supportsVolume: true,
            playbackMode: "browser-speech"
          },
          voices: [{ id: "voice-1", label: "Voice One" }]
        })
      ]
    });

    await expect(service.listProviders()).resolves.toEqual([
      {
        id: "voice-provider",
        label: "Voice Provider",
        capabilities: {
          supportsVoices: true,
          supportsRate: true,
          supportsPitch: false,
          supportsVolume: true,
          playbackMode: "browser-speech"
        },
        voices: [{ id: "voice-1", label: "Voice One" }]
      }
    ]);
  });

  it("rejects unsupported voice, rate, pitch, and volume options", async () => {
    const service = createService({
      providers: [
        createProvider({
          id: "basic-provider",
          capabilities: {
            supportsVoices: false,
            supportsRate: false,
            supportsPitch: false,
            supportsVolume: false,
            playbackMode: "browser-speech"
          }
        })
      ]
    });

    await expect(service.testProvider({ providerId: "missing", text: "hello" })).rejects.toBeInstanceOf(
      UnknownTtsProviderError
    );
    await expect(service.testProvider({ providerId: "basic-provider", text: "hello", voiceId: "voice-1" })).rejects.toMatchObject({
      code: "UNSUPPORTED_TTS_OPTION",
      option: "voice"
    });
    await expect(service.testProvider({ providerId: "basic-provider", text: "hello", rate: 1.2 })).rejects.toMatchObject({
      code: "UNSUPPORTED_TTS_OPTION",
      option: "rate"
    });
    await expect(service.testProvider({ providerId: "basic-provider", text: "hello", pitch: 1.1 })).rejects.toMatchObject({
      code: "UNSUPPORTED_TTS_OPTION",
      option: "pitch"
    });
    await expect(service.testProvider({ providerId: "basic-provider", text: "hello", volume: 0.5 })).rejects.toMatchObject({
      code: "UNSUPPORTED_TTS_OPTION",
      option: "volume"
    });
  });

  it("rejects unknown voices for providers with voice support", async () => {
    const service = createService({
      providers: [
        createProvider({
          id: "voice-provider",
          capabilities: {
            supportsVoices: true,
            supportsRate: false,
            supportsPitch: false,
            supportsVolume: false,
            playbackMode: "browser-speech"
          },
          voices: [{ id: "known", label: "Known Voice" }]
        })
      ]
    });

    await expect(service.testProvider({ providerId: "voice-provider", text: "hello", voiceId: "missing" })).rejects.toEqual(
      expect.objectContaining({
        code: "UNSUPPORTED_TTS_OPTION",
        option: "voice"
      })
    );
  });

  it("applies TTS moderation before provider preview execution", async () => {
    let receivedInput: TtsProviderPlaybackInput | null = null;
    const service = createService({
      moderationService: new DefaultModerationService({
        settings: {
          renderedText: {
            maxLength: 240,
            blockedTerms: [],
            stripUrls: false
          },
          ttsText: {
            maxLength: 80,
            blockedTerms: ["badword"],
            stripUrls: true
          }
        }
      }),
      providers: [
        createProvider({
          id: "moderated-provider",
          async createPlaybackInstruction(input) {
            receivedInput = input;
            return {
              mode: "browser-speech",
              text: input.text,
              audioAssetId: null,
              providerPayload: {
                providerId: input.providerId
              }
            };
          }
        })
      ]
    });

    const result = await service.testProvider({
      providerId: "moderated-provider",
      text: "Read badword https://example.test/secret"
    });

    expect(receivedInput).toMatchObject({
      text: "Read [moderated] [link removed]"
    });
    expect(result.instruction.text).toBe("Read [moderated] [link removed]");
    expect(result.moderationActions.map((action) => action.type)).toEqual(["url-stripped", "blocked-term-replaced"]);
  });

  it("wraps provider failures without exposing provider internals to callers", async () => {
    const service = createService({
      providers: [
        createProvider({
          id: "failing-provider",
          async createPlaybackInstruction() {
            throw new Error("socket closed");
          }
        })
      ]
    });

    await expect(service.testProvider({ providerId: "failing-provider", text: "hello" })).rejects.toBeInstanceOf(
      TtsProviderFailureError
    );
    await expect(service.testProvider({ providerId: "failing-provider", text: "hello" })).rejects.toMatchObject({
      code: "TTS_PROVIDER_FAILURE",
      providerId: "failing-provider"
    });
  });
});

function createService(options: {
  readonly providers: readonly TtsProvider[];
  readonly moderationService?: DefaultModerationService | undefined;
}): DefaultTtsService {
  return new DefaultTtsService({
    moderationService: options.moderationService,
    registry: createRegistry(options.providers)
  });
}

function createRegistry(providers: readonly TtsProvider[]): TtsProviderRegistry {
  return {
    listProviders() {
      return providers;
    },
    getProvider(providerId) {
      return providers.find((provider) => provider.id === providerId) ?? null;
    }
  };
}

function createProvider(
  options: {
    readonly id?: string | undefined;
    readonly capabilities?: TtsProvider["capabilities"] | undefined;
    readonly voices?: TtsProvider["listVoices"] extends () => Promise<infer TVoices> ? TVoices : never;
    readonly createPlaybackInstruction?: TtsProvider["createPlaybackInstruction"] | undefined;
  } = {}
): TtsProvider {
  const id = options.id ?? "test-provider";
  return {
    id,
    label: id
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    capabilities:
      options.capabilities ??
      {
        supportsVoices: false,
        supportsRate: false,
        supportsPitch: false,
        supportsVolume: false,
        playbackMode: "browser-speech"
      },
    async listVoices() {
      return options.voices ?? [];
    },
    async createPlaybackInstruction(input) {
      if (options.createPlaybackInstruction !== undefined) {
        return options.createPlaybackInstruction(input);
      }

      return {
        mode: "browser-speech",
        text: input.text,
        audioAssetId: null,
        providerPayload: {
          providerId: input.providerId,
          voiceId: input.voiceId
        }
      };
    }
  };
}
