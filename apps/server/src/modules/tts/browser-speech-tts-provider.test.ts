import { describe, expect, it } from "vitest";
import { BrowserSpeechTtsProvider } from "./browser-speech-tts-provider.js";
import { createDefaultTtsProviderRegistry } from "./tts-provider-registry.js";

describe("BrowserSpeechTtsProvider", () => {
  it("returns browser-speech playback instructions with provider payload controls", async () => {
    const provider = new BrowserSpeechTtsProvider();

    await expect(
      provider.createPlaybackInstruction({
        providerId: "browser-speech",
        text: "hello",
        voiceId: null,
        rate: 1.1,
        pitch: 0.9,
        volume: 0.8,
        metadata: {}
      })
    ).resolves.toEqual({
      mode: "browser-speech",
      text: "hello",
      audioAssetId: null,
      providerPayload: {
        providerId: "browser-speech",
        voiceId: null,
        rate: 1.1,
        pitch: 0.9,
        volume: 0.8
      }
    });
  });

  it("registers browser speech as the default TTS provider", () => {
    const registry = createDefaultTtsProviderRegistry();

    expect(registry.listProviders().map((provider) => provider.id)).toEqual(["browser-speech"]);
    expect(registry.getProvider("browser-speech")).toBeInstanceOf(BrowserSpeechTtsProvider);
    expect(registry.getProvider("missing")).toBeNull();
  });
});
