import { DefaultModerationService, type ModerationAction, type ModerationService } from "../moderation/moderation-service.js";
import type { TtsPlaybackInstruction, TtsProviderCapabilities, TtsVoice } from "./types.js";
import type { TtsProvider, TtsProviderPlaybackInput, TtsProviderRegistry } from "./tts-provider.js";

export type TtsOptionName = "voice" | "rate" | "pitch" | "volume";

export interface TtsProviderDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: TtsProviderCapabilities;
  readonly voices: readonly TtsVoice[];
}

export interface TtsProviderTestInput {
  readonly providerId: string;
  readonly text: string;
  readonly voiceId?: string | null | undefined;
  readonly rate?: number | null | undefined;
  readonly pitch?: number | null | undefined;
  readonly volume?: number | null | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface TtsProviderTestResult {
  readonly instruction: TtsPlaybackInstruction;
  readonly moderationActions: readonly ModerationAction[];
}

export interface TtsService {
  listProviders(): Promise<readonly TtsProviderDescriptor[]>;
  testProvider(input: TtsProviderTestInput): Promise<TtsProviderTestResult>;
  createPlaybackInstruction(input: TtsProviderTestInput): Promise<TtsProviderTestResult>;
  createPlaybackInstructionFromModeratedText(input: TtsProviderTestInput): Promise<TtsProviderTestResult>;
}

export class UnknownTtsProviderError extends Error {
  readonly code = "UNKNOWN_TTS_PROVIDER";

  constructor(readonly providerId: string) {
    super(`Unknown TTS provider "${providerId}"`);
    this.name = "UnknownTtsProviderError";
  }
}

export class UnsupportedTtsOptionError extends Error {
  readonly code = "UNSUPPORTED_TTS_OPTION";

  constructor(
    readonly providerId: string,
    readonly option: TtsOptionName,
    readonly value: string | number
  ) {
    super(`TTS provider "${providerId}" does not support ${option} option "${value}"`);
    this.name = "UnsupportedTtsOptionError";
  }
}

export class TtsProviderFailureError extends Error {
  readonly code = "TTS_PROVIDER_FAILURE";
  readonly cause: unknown;

  constructor(readonly providerId: string, cause: unknown) {
    super(`TTS provider "${providerId}" failed to create a playback instruction`);
    this.name = "TtsProviderFailureError";
    this.cause = cause;
  }
}

export interface DefaultTtsServiceOptions {
  readonly registry: TtsProviderRegistry;
  readonly moderationService?: ModerationService | undefined;
}

export class DefaultTtsService implements TtsService {
  readonly #registry: TtsProviderRegistry;
  readonly #moderationService: ModerationService;

  constructor(options: DefaultTtsServiceOptions) {
    this.#registry = options.registry;
    this.#moderationService = options.moderationService ?? new DefaultModerationService();
  }

  async listProviders(): Promise<readonly TtsProviderDescriptor[]> {
    return Promise.all(
      this.#registry.listProviders().map(async (provider) => ({
        id: provider.id,
        label: provider.label,
        capabilities: provider.capabilities,
        voices: await provider.listVoices()
      }))
    );
  }

  async testProvider(input: TtsProviderTestInput): Promise<TtsProviderTestResult> {
    return this.createPlaybackInstruction(input);
  }

  async createPlaybackInstruction(input: TtsProviderTestInput): Promise<TtsProviderTestResult> {
    return this.#createPlaybackInstruction(input, true);
  }

  async createPlaybackInstructionFromModeratedText(
    input: TtsProviderTestInput
  ): Promise<TtsProviderTestResult> {
    return this.#createPlaybackInstruction(input, false);
  }

  async #createPlaybackInstruction(
    input: TtsProviderTestInput,
    applyModeration: boolean
  ): Promise<TtsProviderTestResult> {
    const provider = this.#registry.getProvider(input.providerId);
    if (provider === null) {
      throw new UnknownTtsProviderError(input.providerId);
    }

    await validateProviderOptions(provider, input);
    const moderationResult = applyModeration
      ? this.#moderationService.moderate({ target: "tts", text: input.text })
      : { text: input.text, actions: [] as const };
    const playbackInput: TtsProviderPlaybackInput = {
      providerId: provider.id,
      text: moderationResult.text,
      voiceId: input.voiceId ?? null,
      rate: input.rate ?? null,
      pitch: input.pitch ?? null,
      volume: input.volume ?? null,
      metadata: input.metadata ?? {}
    };

    try {
      return {
        instruction: await provider.createPlaybackInstruction(playbackInput),
        moderationActions: moderationResult.actions
      };
    } catch (error) {
      throw new TtsProviderFailureError(provider.id, error);
    }
  }
}

async function validateProviderOptions(provider: TtsProvider, input: TtsProviderTestInput): Promise<void> {
  if (hasValue(input.voiceId)) {
    if (!provider.capabilities.supportsVoices) {
      throw new UnsupportedTtsOptionError(provider.id, "voice", input.voiceId);
    }

    const voices = await provider.listVoices();
    if (!voices.some((voice) => voice.id === input.voiceId)) {
      throw new UnsupportedTtsOptionError(provider.id, "voice", input.voiceId);
    }
  }

  if (hasValue(input.rate) && !provider.capabilities.supportsRate) {
    throw new UnsupportedTtsOptionError(provider.id, "rate", input.rate);
  }

  if (hasValue(input.pitch) && !provider.capabilities.supportsPitch) {
    throw new UnsupportedTtsOptionError(provider.id, "pitch", input.pitch);
  }

  if (hasValue(input.volume) && !provider.capabilities.supportsVolume) {
    throw new UnsupportedTtsOptionError(provider.id, "volume", input.volume);
  }
}

function hasValue<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
