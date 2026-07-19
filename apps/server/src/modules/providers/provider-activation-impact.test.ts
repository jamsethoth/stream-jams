import { describe, expect, it } from "vitest";
import { evaluateProviderActivationImpact } from "./provider-activation-impact.js";

describe("evaluateProviderActivationImpact", () => {
  it("keeps canonical alerts matched when switching event-source provider kinds", () => {
    expect(evaluateProviderActivationImpact({
      capability: "event-source",
      affectedAlertCount: 4,
      changesProviderKind: true,
      currentProviderName: "Twitch",
      targetProviderName: "Streamer.bot",
      occurredAt: "2026-07-17T12:00:00.000Z"
    })).toEqual({
      matchedAlertCount: 4,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    });
  });

  it("retains the review warning when switching TTS provider kinds", () => {
    const impact = evaluateProviderActivationImpact({
      capability: "tts",
      affectedAlertCount: 2,
      changesProviderKind: true,
      currentProviderName: "Speaker.bot",
      targetProviderName: "Browser Speech",
      occurredAt: "2026-07-17T12:00:00.000Z"
    });

    expect(impact).toMatchObject({
      matchedAlertCount: 0,
      unmatchedAlertCount: 2,
      warnings: [expect.objectContaining({
        summary: "Active alerts use a different provider kind",
        correction: { label: "Review active alerts", route: "/manage/modules/alerts" }
      })]
    });
  });
});
