import { describe, expect, it, vi } from "vitest";
import { BrowserSpeechTtsProvider } from "./browser-speech-tts-provider.js";
import { SpeakerBotTtsProvider } from "./speakerbot-tts-provider.js";
import { createDefaultTtsProviderRegistry } from "./tts-provider-registry.js";

describe("createDefaultTtsProviderRegistry", () => {
  it("includes Browser Speech and Speaker.bot when Speaker.bot dependencies are supplied", () => {
    const registry = createDefaultTtsProviderRegistry({
      speakerBot: {
        client: { speak: vi.fn() },
        resolveActiveProvider: async () => null
      }
    });

    expect(registry.listProviders().map(({ id }) => id)).toEqual(["browser-speech", "speakerbot"]);
    expect(registry.getProvider("browser-speech")).toBeInstanceOf(BrowserSpeechTtsProvider);
    expect(registry.getProvider("speakerbot")).toBeInstanceOf(SpeakerBotTtsProvider);
  });
});
