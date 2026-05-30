import { blockedTermReplacement, defaultModerationSettings, strippedUrlReplacement } from "./default-rules.js";

export type ModerationTarget = "rendered" | "tts";

export interface ModerationTargetSettings {
  readonly maxLength: number;
  readonly blockedTerms: readonly string[];
  readonly stripUrls: boolean;
}

export interface ModerationSettings {
  readonly renderedText: ModerationTargetSettings;
  readonly ttsText: ModerationTargetSettings;
}

export interface ModerationTargetSettingsUpdate {
  readonly maxLength?: number | undefined;
  readonly blockedTerms?: readonly string[] | undefined;
  readonly stripUrls?: boolean | undefined;
}

export interface ModerationSettingsUpdate {
  readonly renderedText?: ModerationTargetSettingsUpdate | undefined;
  readonly ttsText?: ModerationTargetSettingsUpdate | undefined;
}

export type ModerationAction =
  | {
      readonly type: "url-stripped";
      readonly count: number;
    }
  | {
      readonly type: "blocked-term-replaced";
      readonly count: number;
    }
  | {
      readonly type: "max-length-truncated";
      readonly maxLength: number;
    };

export interface ModerationInput {
  readonly target: ModerationTarget;
  readonly text: string;
}

export interface ModerationResult {
  readonly text: string;
  readonly actions: readonly ModerationAction[];
}

export interface ModerationService {
  getSettings(): ModerationSettings;
  updateSettings(input: ModerationSettingsUpdate): ModerationSettings;
  moderate(input: ModerationInput): ModerationResult;
}

export class InvalidModerationSettingsError extends Error {
  readonly code = "INVALID_MODERATION_SETTINGS";

  constructor() {
    super("Invalid moderation settings");
    this.name = "InvalidModerationSettingsError";
  }
}

export class DefaultModerationService implements ModerationService {
  #settings: ModerationSettings;

  constructor(options: { readonly settings?: ModerationSettings | undefined } = {}) {
    this.#settings = normalizeSettings(options.settings ?? defaultModerationSettings);
  }

  getSettings(): ModerationSettings {
    return cloneSettings(this.#settings);
  }

  updateSettings(input: ModerationSettingsUpdate): ModerationSettings {
    this.#settings = normalizeSettings({
      renderedText: mergeTargetSettings(this.#settings.renderedText, input.renderedText),
      ttsText: mergeTargetSettings(this.#settings.ttsText, input.ttsText)
    });
    return this.getSettings();
  }

  moderate(input: ModerationInput): ModerationResult {
    const settings = input.target === "rendered" ? this.#settings.renderedText : this.#settings.ttsText;
    const actions: ModerationAction[] = [];
    let text = input.text;

    if (settings.stripUrls) {
      const result = replaceUrls(text);
      text = result.text;
      if (result.count > 0) {
        actions.push({
          type: "url-stripped",
          count: result.count
        });
      }
    }

    if (settings.blockedTerms.length > 0) {
      const result = replaceBlockedTerms(text, settings.blockedTerms);
      text = result.text;
      if (result.count > 0) {
        actions.push({
          type: "blocked-term-replaced",
          count: result.count
        });
      }
    }

    if (text.length > settings.maxLength) {
      text = text.slice(0, settings.maxLength);
      actions.push({
        type: "max-length-truncated",
        maxLength: settings.maxLength
      });
    }

    return {
      text,
      actions
    };
  }
}

function mergeTargetSettings(
  current: ModerationTargetSettings,
  update: ModerationTargetSettingsUpdate | undefined
): ModerationTargetSettings {
  if (update === undefined) {
    return current;
  }

  return {
    maxLength: update.maxLength ?? current.maxLength,
    blockedTerms: update.blockedTerms ?? current.blockedTerms,
    stripUrls: update.stripUrls ?? current.stripUrls
  };
}

function normalizeSettings(settings: ModerationSettings): ModerationSettings {
  return {
    renderedText: normalizeTargetSettings(settings.renderedText),
    ttsText: normalizeTargetSettings(settings.ttsText)
  };
}

function normalizeTargetSettings(settings: ModerationTargetSettings): ModerationTargetSettings {
  if (!Number.isInteger(settings.maxLength) || settings.maxLength < 1 || settings.maxLength > 10_000) {
    throw new InvalidModerationSettingsError();
  }

  if (typeof settings.stripUrls !== "boolean" || !Array.isArray(settings.blockedTerms)) {
    throw new InvalidModerationSettingsError();
  }

  return {
    maxLength: settings.maxLength,
    blockedTerms: normalizeBlockedTerms(settings.blockedTerms),
    stripUrls: settings.stripUrls
  };
}

function normalizeBlockedTerms(blockedTerms: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const blockedTerm of blockedTerms) {
    if (typeof blockedTerm !== "string") {
      throw new InvalidModerationSettingsError();
    }

    const trimmed = blockedTerm.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function replaceUrls(text: string): { readonly text: string; readonly count: number } {
  let count = 0;
  return {
    text: text.replace(urlPattern, () => {
      count += 1;
      return strippedUrlReplacement;
    }),
    count
  };
}

function replaceBlockedTerms(
  text: string,
  blockedTerms: readonly string[]
): { readonly text: string; readonly count: number } {
  let count = 0;
  const pattern = new RegExp(blockedTerms.map(escapeRegExp).join("|"), "gi");

  return {
    text: text.replace(pattern, () => {
      count += 1;
      return blockedTermReplacement;
    }),
    count
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneSettings(settings: ModerationSettings): ModerationSettings {
  return {
    renderedText: {
      maxLength: settings.renderedText.maxLength,
      blockedTerms: [...settings.renderedText.blockedTerms],
      stripUrls: settings.renderedText.stripUrls
    },
    ttsText: {
      maxLength: settings.ttsText.maxLength,
      blockedTerms: [...settings.ttsText.blockedTerms],
      stripUrls: settings.ttsText.stripUrls
    }
  };
}

const urlPattern = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
