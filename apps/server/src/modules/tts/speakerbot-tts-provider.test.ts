import type { RegisteredProviderDetail, TtsProviderPlaybackInput } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { SpeakerBotTtsProvider } from "./speakerbot-tts-provider.js";

describe("SpeakerBotTtsProvider", () => {
  it("triggers the active Speaker.bot registration with provider-owned safety settings", async () => {
    const speak = vi.fn().mockResolvedValue({ id: "request-1", status: "ok" });
    const provider = new SpeakerBotTtsProvider({
      client: { speak },
      resolveActiveProvider: async () => registration()
    });

    await expect(provider.createPlaybackInstruction(playbackInput())).resolves.toEqual({
      mode: "remote-trigger",
      text: "Raid from James",
      audioAssetId: null,
      providerPayload: { providerId: "speakerbot" }
    });
    expect(provider.id).toBe("speakerbot");
    expect(provider.capabilities.playbackMode).toBe("remote-trigger");
    expect(speak).toHaveBeenCalledWith("ws://127.0.0.1:7680/", {
      voice: "EventVoice",
      message: "Raid from James",
      badWordFilter: true
    });
  });

  it.each([
    ["missing", null],
    ["inactive", registration({ active: false })],
    ["wrong-kind", registration({ kind: "browser-speech" })]
  ] as const)("rejects %s active registration resolution", async (_label, detail) => {
    const provider = new SpeakerBotTtsProvider({
      client: { speak: vi.fn() },
      resolveActiveProvider: async () => detail
    });

    await expect(provider.createPlaybackInstruction(playbackInput())).rejects.toThrow(
      "An active Speaker.bot TTS provider is required"
    );
  });

  it("rejects an active registration without a default voice", async () => {
    const provider = new SpeakerBotTtsProvider({
      client: { speak: vi.fn() },
      resolveActiveProvider: async () => registration({ defaultVoiceId: null })
    });

    await expect(provider.createPlaybackInstruction(playbackInput())).rejects.toThrow(
      "Speaker.bot requires a default voice"
    );
  });

  it("lists voices from the active Speaker.bot registration", async () => {
    const provider = new SpeakerBotTtsProvider({
      client: { speak: vi.fn() },
      resolveActiveProvider: async () => registration()
    });

    await expect(provider.listVoices()).resolves.toEqual([{ id: "EventVoice", label: "Event voice" }]);
  });
});

function playbackInput(): TtsProviderPlaybackInput {
  return {
    providerId: "speakerbot",
    text: "Raid from James",
    voiceId: null,
    rate: null,
    pitch: null,
    volume: null,
    metadata: {}
  };
}

function registration(
  overrides: { readonly active?: boolean; readonly kind?: RegisteredProviderDetail["provider"]["kind"]; readonly defaultVoiceId?: string | null } = {}
): RegisteredProviderDetail {
  const kind = overrides.kind ?? "speakerbot";
  return {
    provider: {
      id: "speakerbot-1",
      name: "Speaker.bot",
      kind,
      capability: "tts",
      active: overrides.active ?? true,
      connectionState: "connected",
      intakeState: null,
      validatedAt: "2026-07-18T12:00:00.000Z",
      error: null,
      usedByAlertCount: 1
    },
    configuration: kind === "speakerbot"
      ? { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" }
      : {},
    availableVoices: [{ id: "EventVoice", label: "Event voice" }],
    ttsSafety: {
      defaultVoiceId: overrides.defaultVoiceId === undefined ? "EventVoice" : overrides.defaultVoiceId,
      volume: 1,
      minimumRate: 0.8,
      maximumRate: 1.2,
      maximumTextLength: 280
    }
  };
}
