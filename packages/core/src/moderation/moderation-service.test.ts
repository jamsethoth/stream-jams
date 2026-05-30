import { describe, expect, it } from "vitest";
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
});
