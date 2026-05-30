import type { TtsProvider, TtsProviderRegistry } from "@stream-jams/core";
import { BrowserSpeechTtsProvider } from "./browser-speech-tts-provider.js";

export class StaticTtsProviderRegistry implements TtsProviderRegistry {
  readonly #providers: ReadonlyMap<string, TtsProvider>;

  constructor(providers: readonly TtsProvider[]) {
    this.#providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  listProviders(): readonly TtsProvider[] {
    return [...this.#providers.values()];
  }

  getProvider(providerId: string): TtsProvider | null {
    return this.#providers.get(providerId) ?? null;
  }
}

export function createDefaultTtsProviderRegistry(): TtsProviderRegistry {
  return new StaticTtsProviderRegistry([new BrowserSpeechTtsProvider()]);
}
