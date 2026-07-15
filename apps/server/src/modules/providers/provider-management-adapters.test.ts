import type { RegisteredProviderDetail, TtsService } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamerBotSocket } from "../streamerbot/streamerbot-client.js";
import {
  createProviderManagementAdapters,
  type SpeakerBotSocket
} from "./provider-management-adapters.js";

const now = new Date("2026-07-15T12:00:00.000Z");

describe("provider management adapters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates Twitch from OAuth and EventSub runtime status", async () => {
    const harness = createHarness({
      twitchConnected: true,
      twitchEventSubState: "connected"
    });

    await expect(harness.adapters.get("twitch")?.validate(twitchInput())).resolves.toEqual({
      valid: true,
      connectionState: "connected",
      intakeState: "active",
      validatedAt: now.toISOString(),
      availableVoices: [],
      error: null
    });
  });

  it("throws an actionable Twitch error when OAuth is disconnected", async () => {
    const harness = createHarness({ twitchConnected: false });

    await expect(harness.adapters.get("twitch")?.validate(twitchInput())).rejects.toThrow(
      "Connect Twitch in Event Sources, then retry"
    );
  });

  it("validates Streamer.bot with the existing client and GetInfo protocol", async () => {
    const harness = createHarness();
    const validation = harness.adapters.get("streamerbot")?.validate(streamerBotInput());
    const socket = harness.streamerBotSockets[0];

    await socket?.emitMessage({ request: "Hello", info: { name: "Streamer.bot" } });
    await vi.advanceTimersByTimeAsync(25);
    expect(socket?.sent).toEqual([{ request: "GetInfo", id: "streamerbot-request" }]);

    await socket?.emitMessage({
      id: "streamerbot-request",
      request: "GetInfo",
      status: "ok",
      info: { name: "Streamer.bot", version: "2.6.0" }
    });

    await expect(validation).resolves.toMatchObject({
      valid: true,
      connectionState: "connected",
      intakeState: "inactive"
    });
    expect(harness.streamerBotUrls).toEqual(["ws://127.0.0.1:8080/"]);
    expect(socket?.closeCount).toBe(1);
  });

  it("reports how to correct a Streamer.bot connection failure", async () => {
    const harness = createHarness();
    const validation = harness.adapters.get("streamerbot")?.validate(streamerBotInput());
    const rejection = expect(validation).rejects.toThrow(
      "Start Streamer.bot, enable its WebSocket server, verify ws://127.0.0.1:8080/, then retry"
    );

    harness.streamerBotSockets[0]?.emitError(new Error("connect failed"));
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("uses Speaker.bot GetInfo for validation and Speak for voice tests", async () => {
    const harness = createHarness();
    const adapter = harness.adapters.get("speakerbot");
    const validation = adapter?.validate(speakerBotInput());
    const validationSocket = harness.speakerBotSockets[0];

    await validationSocket?.emitOpen();
    expect(validationSocket?.sent).toEqual([{ id: "speaker-request-1", request: "GetInfo" }]);
    await validationSocket?.emitMessage({ id: "speaker-request-1", status: "ok", info: { version: "0.2.16" } });

    await expect(validation).resolves.toMatchObject({
      valid: true,
      connectionState: "connected",
      intakeState: null
    });

    const voiceTest = adapter?.testVoice?.({
      provider: speakerBotProvider(),
      text: "Stream Jams voice test"
    });
    const voiceSocket = harness.speakerBotSockets[1];

    await voiceSocket?.emitOpen();
    expect(voiceSocket?.sent).toEqual([
      {
        id: "speaker-request-2",
        request: "Speak",
        message: "Stream Jams voice test",
        voice: "voice-1"
      }
    ]);
    await voiceSocket?.emitMessage({ id: "speaker-request-2", status: "ok" });

    await expect(voiceTest).resolves.toEqual({ delivered: true, error: null });
    expect(harness.speakerBotUrls).toEqual([
      "ws://127.0.0.1:7680/",
      "ws://127.0.0.1:7680/"
    ]);
  });

  it("validates and tests Browser Speech through the existing TTS service", async () => {
    const testProvider = vi.fn<TtsService["testProvider"]>().mockResolvedValue({
      instruction: {
        mode: "browser-speech",
        text: "Stream Jams voice test",
        audioAssetId: null,
        providerPayload: null
      },
      moderationActions: []
    });
    const harness = createHarness({
      ttsService: {
        async listProviders() {
          return [
            {
              id: "browser-speech",
              label: "Browser Speech",
              capabilities: {
                supportsVoices: true,
                supportsRate: true,
                supportsPitch: true,
                supportsVolume: true,
                playbackMode: "browser-speech"
              },
              voices: [{ id: "voice-1", label: "System voice" }]
            }
          ];
        },
        testProvider
      }
    });
    const adapter = harness.adapters.get("browser-speech");

    await expect(adapter?.validate(browserSpeechInput())).resolves.toMatchObject({
      valid: true,
      connectionState: "connected",
      availableVoices: [{ id: "voice-1", label: "System voice" }]
    });
    await expect(
      adapter?.testVoice?.({ provider: browserSpeechProvider(), text: "Stream Jams voice test" })
    ).resolves.toEqual({ delivered: true, error: null });
    expect(testProvider).toHaveBeenCalledWith({
      providerId: "browser-speech",
      text: "Stream Jams voice test",
      voiceId: "voice-1",
      volume: 0.8
    });
  });
});

interface HarnessOptions {
  readonly twitchConnected?: boolean;
  readonly twitchEventSubState?: "idle" | "connecting" | "connected" | "reconnecting" | "degraded" | "error";
  readonly ttsService?: Pick<TtsService, "listProviders" | "testProvider">;
}

function createHarness(options: HarnessOptions = {}) {
  const streamerBotSockets: FakeSocket[] = [];
  const streamerBotUrls: string[] = [];
  const speakerBotSockets: FakeSocket[] = [];
  const speakerBotUrls: string[] = [];
  const requestIds = ["speaker-request-1", "speaker-request-2"];
  let requestIdIndex = 0;
  const adapters = createProviderManagementAdapters({
    twitchOAuthService: {
      async getStatus() {
        return options.twitchConnected === false
          ? { connected: false as const, account: null }
          : {
              connected: true as const,
              account: {
                accountId: "account-1",
                login: "jam",
                displayName: "Jam",
                scopes: [],
                connectedAt: now.toISOString(),
                updatedAt: now.toISOString()
              }
            };
      }
    },
    twitchEventSubRuntimeService: {
      getStatus() {
        const state = options.twitchEventSubState ?? "idle";
        return {
          state,
          connectionState: state === "degraded" ? "connected" : state,
          sessionId: state === "connected" ? "session-1" : null,
          connectedAt: null,
          lastMessageAt: null,
          subscriptionTypes: [],
          acceptedCount: 0,
          duplicateCount: 0,
          rejectedCount: 0,
          lastEventAt: null,
          lastErrorAt: null,
          message: state === "error" ? "Twitch EventSub access token is unavailable" : null
        };
      }
    },
    streamerBotSocketFactory(url) {
      streamerBotUrls.push(url);
      const socket = new FakeSocket();
      streamerBotSockets.push(socket);
      return socket as StreamerBotSocket;
    },
    speakerBotSocketFactory(url) {
      speakerBotUrls.push(url);
      const socket = new FakeSocket();
      speakerBotSockets.push(socket);
      return socket as SpeakerBotSocket;
    },
    ttsService:
      options.ttsService ??
      ({
        async listProviders() {
          return [];
        },
        async testProvider() {
          throw new Error("Unexpected TTS test");
        }
      } satisfies Pick<TtsService, "listProviders" | "testProvider">),
    now: () => now,
    generateRequestId() {
      const id = requestIds[requestIdIndex];
      requestIdIndex += 1;
      if (id === undefined) {
        throw new Error("Test Speaker.bot request ID generator was exhausted");
      }
      return id;
    },
    streamerBotRequestIdGenerator: () => "streamerbot-request",
    timeoutMs: 100
  });

  return {
    adapters,
    speakerBotSockets,
    speakerBotUrls,
    streamerBotSockets,
    streamerBotUrls
  };
}

class FakeSocket {
  closeCount = 0;
  readonly sent: unknown[] = [];
  readonly #listeners = {
    open: [] as (() => void | Promise<void>)[],
    message: [] as ((event: { readonly data: unknown }) => void | Promise<void>)[],
    close: [] as ((event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>)[],
    error: [] as ((event: unknown) => void | Promise<void>)[]
  };

  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event === "open") {
      this.#listeners.open.push(listener as () => void | Promise<void>);
      return;
    }
    if (event === "message") {
      this.#listeners.message.push(listener as (event: { readonly data: unknown }) => void | Promise<void>);
      return;
    }
    if (event === "close") {
      this.#listeners.close.push(listener as (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>);
      return;
    }
    this.#listeners.error.push(listener as (event: unknown) => void | Promise<void>);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as unknown);
  }

  close(): void {
    this.closeCount += 1;
  }

  async emitOpen(): Promise<void> {
    for (const listener of this.#listeners.open) {
      await listener();
    }
  }

  async emitMessage(message: unknown): Promise<void> {
    for (const listener of this.#listeners.message) {
      await listener({ data: JSON.stringify(message) });
    }
  }

  emitError(error: unknown): void {
    for (const listener of this.#listeners.error) {
      void listener(error);
    }
  }
}

function twitchInput() {
  return { name: "Twitch", kind: "twitch", configuration: {} } as const;
}

function streamerBotInput() {
  return {
    name: "Streamer.bot",
    kind: "streamerbot",
    configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
  } as const;
}

function speakerBotInput() {
  return {
    name: "Speaker.bot",
    kind: "speakerbot",
    configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" }
  } as const;
}

function browserSpeechInput() {
  return { name: "Browser Speech", kind: "browser-speech", configuration: {} } as const;
}

function speakerBotProvider(): RegisteredProviderDetail {
  return {
    provider: {
      id: "speakerbot-1",
      name: "Speaker.bot",
      kind: "speakerbot",
      capability: "tts",
      active: true,
      connectionState: "connected",
      intakeState: null,
      validatedAt: now.toISOString(),
      error: null,
      usedByAlertCount: 1
    },
    configuration: speakerBotInput().configuration,
    availableVoices: [{ id: "voice-1", label: "Voice 1" }],
    ttsSafety: {
      defaultVoiceId: "voice-1",
      volume: 0.8,
      minimumRate: 0.8,
      maximumRate: 1.2,
      maximumTextLength: 280
    }
  };
}

function browserSpeechProvider(): RegisteredProviderDetail {
  return {
    ...speakerBotProvider(),
    provider: {
      ...speakerBotProvider().provider,
      id: "browser-speech-1",
      name: "Browser Speech",
      kind: "browser-speech"
    },
    configuration: {}
  };
}
