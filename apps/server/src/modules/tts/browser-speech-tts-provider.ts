import type { TtsPlaybackInstruction, TtsProvider, TtsProviderPlaybackInput, TtsVoice } from "@stream-jams/core";

export class BrowserSpeechTtsProvider implements TtsProvider {
  readonly id = "browser-speech";
  readonly label = "Browser Speech";
  readonly capabilities = {
    supportsVoices: false,
    supportsRate: true,
    supportsPitch: true,
    supportsVolume: true,
    playbackMode: "browser-speech"
  } as const;

  async listVoices(): Promise<readonly TtsVoice[]> {
    return [];
  }

  async createPlaybackInstruction(input: TtsProviderPlaybackInput): Promise<TtsPlaybackInstruction> {
    return {
      mode: "browser-speech",
      text: input.text,
      audioAssetId: null,
      providerPayload: {
        providerId: this.id,
        voiceId: input.voiceId,
        rate: input.rate,
        pitch: input.pitch,
        volume: input.volume
      }
    };
  }
}
