import type { TtsPlaybackInstruction, TtsProviderCapabilities, TtsVoice } from "./types.js";

export interface TtsProviderPlaybackInput {
  readonly providerId: string;
  readonly text: string;
  readonly voiceId: string | null;
  readonly rate: number | null;
  readonly pitch: number | null;
  readonly volume: number | null;
  readonly metadata: Record<string, unknown>;
}

export interface TtsProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: TtsProviderCapabilities;
  listVoices(): Promise<readonly TtsVoice[]>;
  createPlaybackInstruction(input: TtsProviderPlaybackInput): Promise<TtsPlaybackInstruction>;
}

export interface TtsProviderRegistry {
  listProviders(): readonly TtsProvider[];
  getProvider(providerId: string): TtsProvider | null;
}
