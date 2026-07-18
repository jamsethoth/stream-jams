import type { TtsProvider, TtsProviderRegistry } from "@stream-jams/core";
import { BrowserSpeechTtsProvider } from "./browser-speech-tts-provider.js";
import { SpeakerBotTtsProvider, type SpeakerBotTtsProviderOptions } from "./speakerbot-tts-provider.js";

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

export function createDefaultTtsProviderRegistry(
  options: { readonly speakerBot?: SpeakerBotTtsProviderOptions | undefined } = {}
): TtsProviderRegistry {
  const providers: TtsProvider[] = [new BrowserSpeechTtsProvider()];
  if (options.speakerBot !== undefined) providers.push(new SpeakerBotTtsProvider(options.speakerBot));
  return new StaticTtsProviderRegistry(providers);
}
