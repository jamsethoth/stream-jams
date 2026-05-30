import type { ModerationSettings } from "./moderation-service.js";

export const defaultModerationSettings: ModerationSettings = {
  renderedText: {
    maxLength: 240,
    blockedTerms: [],
    stripUrls: false
  },
  ttsText: {
    maxLength: 180,
    blockedTerms: [],
    stripUrls: true
  }
};

export const blockedTermReplacement = "[moderated]";
export const strippedUrlReplacement = "[link removed]";
