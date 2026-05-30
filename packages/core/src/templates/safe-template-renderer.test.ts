import { describe, expect, it } from "vitest";
import { DefaultModerationService } from "../moderation/moderation-service.js";
import { SafeTemplateRenderer } from "./safe-template-renderer.js";

describe("SafeTemplateRenderer", () => {
  it("escapes HTML by default before applying moderation rules", () => {
    const moderationService = new DefaultModerationService({
      settings: {
        renderedText: {
          maxLength: 120,
          blockedTerms: ["bad"],
          stripUrls: true
        },
        ttsText: {
          maxLength: 120,
          blockedTerms: [],
          stripUrls: false
        }
      }
    });
    const renderer = new SafeTemplateRenderer({
      moderationService,
      target: "rendered"
    });

    expect(
      renderer.render({
        template: "{name}: {message}",
        values: {
          name: "<Viewer>",
          message: "BAD https://example.test/<script>"
        }
      })
    ).toBe("&lt;Viewer&gt;: [moderated] [link removed]");
  });

  it("uses the TTS target rules independently", () => {
    const moderationService = new DefaultModerationService({
      settings: {
        renderedText: {
          maxLength: 120,
          blockedTerms: [],
          stripUrls: false
        },
        ttsText: {
          maxLength: 17,
          blockedTerms: ["spoiler"],
          stripUrls: true
        }
      }
    });
    const renderer = new SafeTemplateRenderer({
      moderationService,
      target: "tts"
    });

    expect(
      renderer.render({
        template: "{message}",
        values: {
          message: "spoiler https://example.test/path after"
        }
      })
    ).toBe("[moderated] [link");
  });
});
