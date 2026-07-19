import {
  providerSetupInputSchema,
  type RegisteredProviderDetail,
  type TtsPlaybackInstruction,
  type TtsProvider,
  type TtsProviderPlaybackInput,
  type TtsVoice
} from "@stream-jams/core";
import {
  buildSpeakerBotWebSocketUrl,
  type SpeakerBotClient
} from "./speakerbot-client.js";

export interface SpeakerBotTtsProviderOptions {
  readonly client: Pick<SpeakerBotClient, "speak">;
  readonly resolveActiveProvider: () => Promise<RegisteredProviderDetail | null>;
}

export class SpeakerBotTtsProvider implements TtsProvider {
  readonly id = "speakerbot";
  readonly label = "Speaker.bot";
  readonly capabilities = {
    supportsVoices: true,
    supportsRate: false,
    supportsPitch: false,
    supportsVolume: false,
    playbackMode: "remote-trigger"
  } as const;
  readonly #client: Pick<SpeakerBotClient, "speak">;
  readonly #resolveActiveProvider: () => Promise<RegisteredProviderDetail | null>;

  constructor(options: SpeakerBotTtsProviderOptions) {
    this.#client = options.client;
    this.#resolveActiveProvider = options.resolveActiveProvider;
  }

  async listVoices(): Promise<readonly TtsVoice[]> {
    const detail = await this.#resolveActiveProvider();
    return isActiveSpeakerBot(detail) ? detail.availableVoices : [];
  }

  async createPlaybackInstruction(input: TtsProviderPlaybackInput): Promise<TtsPlaybackInstruction> {
    const detail = await this.#resolveActiveProvider();
    if (!isActiveSpeakerBot(detail)) {
      throw new Error("An active Speaker.bot TTS provider is required");
    }

    const setup = providerSetupInputSchema.safeParse({
      name: detail.provider.name,
      kind: "speakerbot",
      configuration: detail.configuration
    });
    if (!setup.success || setup.data.kind !== "speakerbot") {
      throw new Error("Active Speaker.bot connection settings are invalid");
    }

    const voice = detail.ttsSafety?.defaultVoiceId;
    if (voice === null || voice === undefined || voice.trim().length === 0) {
      throw new Error("Speaker.bot requires a default voice");
    }

    await this.#client.speak(buildSpeakerBotWebSocketUrl(setup.data.configuration), {
      voice,
      message: input.text,
      badWordFilter: true
    });
    return {
      mode: "remote-trigger",
      text: input.text,
      audioAssetId: null,
      providerPayload: { providerId: this.id }
    };
  }
}

function isActiveSpeakerBot(detail: RegisteredProviderDetail | null): detail is RegisteredProviderDetail {
  return detail?.provider.active === true
    && detail.provider.kind === "speakerbot"
    && detail.provider.capability === "tts";
}
