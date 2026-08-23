import { blockedTermReplacement, defaultModerationSettings, strippedUrlReplacement } from "./default-rules.js";
import type { ModerationSettingsRepository } from "./repository.js";

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

export interface ModerationPreviewInput {
  readonly target: ModerationTarget;
  readonly text: string;
  readonly settings?: ModerationTargetSettings | undefined;
}

export interface ModerationPreviewResult extends ModerationResult {
  readonly target: ModerationTarget;
  readonly settings: ModerationTargetSettings;
}

export interface ModerationService {
  getSettings(): ModerationSettings;
  updateSettings(input: ModerationSettingsUpdate): ModerationSettings;
  reloadSettings(): ModerationSettings;
  moderate(input: ModerationInput): ModerationResult;
  preview(input: ModerationPreviewInput): ModerationPreviewResult;
}

export class InvalidModerationSettingsError extends Error {
  readonly code = "INVALID_MODERATION_SETTINGS";

  constructor() {
    super("Invalid moderation settings");
    this.name = "InvalidModerationSettingsError";
  }
}

export class ModerationSettingsPersistenceError extends Error {
  constructor() {
    super("Unable to save moderation settings");
    this.name = "ModerationSettingsPersistenceError";
  }
}

export class DefaultModerationService implements ModerationService {
  #settings: ModerationSettings;
  readonly #repository: ModerationSettingsRepository | undefined;

  constructor(
    options: {
      readonly repository?: ModerationSettingsRepository | undefined;
      readonly settings?: ModerationSettings | undefined;
    } = {}
  ) {
    this.#repository = options.repository;
    this.#settings = normalizeModerationSettings(options.settings ?? defaultModerationSettings);
    if (this.#repository !== undefined) {
      this.#settings = this.#readOrRepairSettings();
    }
  }

  getSettings(): ModerationSettings {
    return cloneSettings(this.#settings);
  }

  updateSettings(input: ModerationSettingsUpdate): ModerationSettings {
    const next = normalizeModerationSettings({
      renderedText: mergeTargetSettings(this.#settings.renderedText, input.renderedText),
      ttsText: mergeTargetSettings(this.#settings.ttsText, input.ttsText)
    });
    this.#replaceSettings(next);
    this.#settings = next;
    return this.getSettings();
  }

  reloadSettings(): ModerationSettings {
    const next = this.#repository === undefined
      ? normalizeModerationSettings(this.#settings)
      : this.#readOrRepairSettings();
    this.#settings = next;
    return this.getSettings();
  }

  moderate(input: ModerationInput): ModerationResult {
    const settings = input.target === "rendered" ? this.#settings.renderedText : this.#settings.ttsText;
    return moderateText(input.text, settings);
  }

  preview(input: ModerationPreviewInput): ModerationPreviewResult {
    const activeSettings = input.target === "rendered" ? this.#settings.renderedText : this.#settings.ttsText;
    const settings = input.settings === undefined ? activeSettings : normalizeTargetSettings(input.settings);
    return {
      target: input.target,
      settings: cloneTargetSettings(settings),
      ...moderateText(input.text, settings)
    };
  }

  #readOrRepairSettings(): ModerationSettings {
    const persisted = this.#repository?.read();
    if (persisted !== null && persisted !== undefined) {
      return normalizeModerationSettings(persisted);
    }

    const defaults = normalizeModerationSettings(defaultModerationSettings);
    this.#replaceSettings(defaults);
    return defaults;
  }

  #replaceSettings(next: ModerationSettings): void {
    if (this.#repository === undefined) {
      return;
    }

    try {
      this.#repository.replace(next);
    } catch {
      throw new ModerationSettingsPersistenceError();
    }
  }
}

function moderateText(textInput: string, settings: ModerationTargetSettings): ModerationResult {
    const actions: ModerationAction[] = [];
    let text = textInput;

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

export function normalizeModerationSettings(settings: ModerationSettings): ModerationSettings {
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
    renderedText: cloneTargetSettings(settings.renderedText),
    ttsText: cloneTargetSettings(settings.ttsText)
  };
}

function cloneTargetSettings(settings: ModerationTargetSettings): ModerationTargetSettings {
  return {
    maxLength: settings.maxLength,
    blockedTerms: [...settings.blockedTerms],
    stripUrls: settings.stripUrls
  };
}

const urlPattern = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
