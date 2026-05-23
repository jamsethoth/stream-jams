export interface TtsPlaybackInstruction {
  readonly mode: "audio-file" | "remote-trigger" | "browser-speech";
  readonly text: string;
  readonly audioAssetId: string | null;
  readonly providerPayload: Record<string, unknown> | null;
}

export interface TtsProviderCapabilities {
  readonly supportsVoices: boolean;
  readonly supportsRate: boolean;
  readonly supportsPitch: boolean;
  readonly supportsVolume: boolean;
  readonly playbackMode: "audio-file" | "remote-trigger" | "browser-speech";
}

export interface TtsProviderConfigRef {
  readonly providerId: string;
  readonly accountId: string;
}

export interface TtsVoice {
  readonly id: string;
  readonly label: string;
}
