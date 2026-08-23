import { describe, expect, it } from "vitest";
import { defaultModerationSettings } from "./default-rules.js";
import type { ModerationSettingsRepository } from "./repository.js";
import { DefaultModerationService } from "./moderation-service.js";

describe("DefaultModerationService", () => {
  it("applies blocked terms, URL stripping, and max length per target", () => {
    const service = new DefaultModerationService({
      settings: {
        renderedText: {
          maxLength: 36,
          blockedTerms: ["bad word"],
          stripUrls: true
        },
        ttsText: {
          maxLength: 24,
          blockedTerms: ["spoiler"],
          stripUrls: true
        }
      }
    });

    expect(
      service.moderate({
        target: "rendered",
        text: "Visit https://example.test/secret for BAD WORD content"
      })
    ).toMatchObject({
      text: "Visit [link removed] for [moderated]",
      actions: [
        { type: "url-stripped", count: 1 },
        { type: "blocked-term-replaced", count: 1 },
        { type: "max-length-truncated", maxLength: 36 }
      ]
    });

    expect(
      service.moderate({
        target: "tts",
        text: "spoiler at www.example.test/path"
      })
    ).toMatchObject({
      text: "[moderated] at [link rem",
      actions: [
        { type: "url-stripped", count: 1 },
        { type: "blocked-term-replaced", count: 1 },
        { type: "max-length-truncated", maxLength: 24 }
      ]
    });
  });

  it("normalizes settings updates without exposing raw moderated input in diagnostics", () => {
    const service = new DefaultModerationService();

    const settings = service.updateSettings({
      renderedText: {
        blockedTerms: ["  Alpha  ", "alpha", "", "Beta"],
        stripUrls: true
      }
    });
    const result = service.moderate({
      target: "rendered",
      text: "Alpha beta token-secret"
    });

    expect(settings.renderedText.blockedTerms).toEqual(["Alpha", "Beta"]);
    expect(result.text).toBe("[moderated] [moderated] token-secret");
    expect(JSON.stringify(result.actions)).not.toContain("token-secret");
  });

  it("rejects invalid moderation settings", () => {
    const service = new DefaultModerationService();

    expect(() =>
      service.updateSettings({
        ttsText: {
          maxLength: 0
        }
      })
    ).toThrow("Invalid moderation settings");
  });

  it("repairs missing repository settings and activates canonical defaults", () => {
    const repository = new RecordingModerationSettingsRepository(null);

    const service = new DefaultModerationService({ repository });

    expect(service.getSettings()).toEqual(defaultModerationSettings);
    expect(repository.read()).toEqual(defaultModerationSettings);
  });

  it("normalizes a repository-backed update before persisting and activating it", () => {
    const repository = new RecordingModerationSettingsRepository({
      renderedText: { maxLength: 320, blockedTerms: [" Initial "], stripUrls: true },
      ttsText: { maxLength: 220, blockedTerms: [], stripUrls: false }
    });
    const service = new DefaultModerationService({ repository });

    expect(service.getSettings()).toEqual({
      renderedText: { maxLength: 320, blockedTerms: ["Initial"], stripUrls: true },
      ttsText: { maxLength: 220, blockedTerms: [], stripUrls: false }
    });

    expect(
      service.updateSettings({
        renderedText: { blockedTerms: ["  Alpha  ", "alpha", "", "Beta"], stripUrls: true }
      })
    ).toMatchObject({
      renderedText: { blockedTerms: ["Alpha", "Beta"], stripUrls: true }
    });
    expect(repository.read()).toMatchObject({
      renderedText: { blockedTerms: ["Alpha", "Beta"], stripUrls: true }
    });
  });

  it("retains the active policy and redacts viewer text when persistence fails", () => {
    const repository = new RecordingModerationSettingsRepository(defaultModerationSettings);
    const service = new DefaultModerationService({ repository });
    const before = service.getSettings();
    repository.replaceError = new Error("failed for viewer-secret-text");

    expect(() => service.updateSettings({ renderedText: { maxLength: 42 } })).toThrow(
      "Unable to save moderation settings"
    );
    expect(service.getSettings()).toEqual(before);
    expect(() => service.updateSettings({ renderedText: { maxLength: 42 } })).not.toThrow("viewer-secret-text");
  });

  it("reloads persisted settings and repairs a missing row for a second service", () => {
    const repository = new RecordingModerationSettingsRepository({
      renderedText: { maxLength: 320, blockedTerms: ["Initial"], stripUrls: false },
      ttsText: { maxLength: 220, blockedTerms: [], stripUrls: true }
    });
    const first = new DefaultModerationService({ repository });

    repository.value = {
      renderedText: { maxLength: 160, blockedTerms: [" Reloaded "], stripUrls: true },
      ttsText: { maxLength: 140, blockedTerms: ["Tts"], stripUrls: false }
    };

    expect(first.reloadSettings()).toEqual({
      renderedText: { maxLength: 160, blockedTerms: ["Reloaded"], stripUrls: true },
      ttsText: { maxLength: 140, blockedTerms: ["Tts"], stripUrls: false }
    });

    repository.value = null;
    const second = new DefaultModerationService({ repository });

    expect(second.getSettings()).toEqual(defaultModerationSettings);
    expect(repository.read()).toEqual(defaultModerationSettings);
  });

  it("activates a non-default policy persisted by a prior service", () => {
    const repository = new RecordingModerationSettingsRepository(defaultModerationSettings);
    const first = new DefaultModerationService({ repository });
    const persisted = first.updateSettings({
      renderedText: { maxLength: 96, blockedTerms: ["First"], stripUrls: true },
      ttsText: { maxLength: 84, blockedTerms: ["Second"], stripUrls: false }
    });

    const second = new DefaultModerationService({ repository });

    expect(second.getSettings()).toEqual(persisted);
  });

  it("retains the active policy when a missing-row reload repair fails", () => {
    const repository = new RecordingModerationSettingsRepository(defaultModerationSettings);
    const service = new DefaultModerationService({ repository });
    const active = service.updateSettings({ renderedText: { maxLength: 99, blockedTerms: ["Active"] } });
    repository.value = null;
    repository.replaceError = new Error("failed for viewer-secret-text");

    expect(() => service.reloadSettings()).toThrow("Unable to save moderation settings");
    expect(service.getSettings()).toEqual(active);
  });
});

class RecordingModerationSettingsRepository implements ModerationSettingsRepository {
  value: ReturnType<DefaultModerationService["getSettings"]> | null;
  replaceError: Error | null = null;

  constructor(settings: ReturnType<DefaultModerationService["getSettings"]> | null) {
    this.value = settings;
  }

  read() {
    return this.value;
  }

  replace(settings: ReturnType<DefaultModerationService["getSettings"]>): void {
    if (this.replaceError !== null) {
      throw this.replaceError;
    }

    this.value = settings;
  }
}
