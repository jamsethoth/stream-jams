import { describe, expect, it } from "vitest";
import type { ProviderKind } from "@stream-jams/core";
import { evaluateProviderActivationImpact, findOverlappingTwitchSources } from "./provider-activation-impact.js";
import type { ProviderRegistrationRecord } from "./sqlite-provider-registration-repository.js";

describe("evaluateProviderActivationImpact", () => {
  it("does not attribute alert impact to a Music source switch", () => {
    expect(evaluateProviderActivationImpact({ capability: "music-source", affectedAlertCount: 4, changesProviderKind: true, currentProviderName: "Pear A", targetProviderName: "Pear B", occurredAt: "2026-07-17T12:00:00.000Z" })).toEqual({ matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] });
  });
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

  it("warns with a link to the forwarding setting when Twitch events would arrive from two sources", () => {
    const impact = evaluateProviderActivationImpact({
      capability: "event-source",
      affectedAlertCount: 3,
      changesProviderKind: false,
      currentProviderName: "the current provider",
      targetProviderName: "Twitch",
      occurredAt: "2026-07-17T12:00:00.000Z",
      overlappingTwitchSources: { twitchName: "Twitch", streamerBotName: "Studio bot", streamerBotProviderId: "provider sb" }
    });

    expect(impact).toMatchObject({ matchedAlertCount: 3, unmatchedAlertCount: 0, blockers: [] });
    expect(impact.warnings).toEqual([expect.objectContaining({
      summary: "Twitch events will arrive from two sources",
      cause: expect.stringContaining("Duplicates are merged"),
      nextStep: expect.stringContaining("turn off Twitch forwarding in Studio bot"),
      correction: { label: "Review Twitch forwarding", route: "/manage/event-sources?provider=provider%20sb" }
    })]);
  });
});

describe("findOverlappingTwitchSources", () => {
  it.each([
    ["direct Twitch while a forwarding Streamer.bot is in use", record("twitch", false), [record("streamerbot", true)], "provider-streamerbot"],
    ["Streamer.bot with forwarding while direct Twitch is in use", record("streamerbot", false), [record("twitch", true)], "provider-streamerbot"],
    ["direct Twitch while Streamer.bot forwarding is off", record("twitch", false), [record("streamerbot", true, false)], null],
    ["Streamer.bot without forwarding while direct Twitch is in use", record("streamerbot", false, false), [record("twitch", true)], null],
    ["direct Twitch with no other source", record("twitch", false), [], null],
    ["a source that is already in use", record("twitch", true), [record("streamerbot", true)], null],
    ["a TTS provider", { ...record("twitch", false), provider: { ...record("twitch", false).provider, kind: "speakerbot" as const, capability: "tts" as const } }, [record("streamerbot", true)], null]
  ])("reports overlap for %s", async (_label, target, active, expected) => {
    const repository = { findActiveByKind: async (kind: ProviderKind) => active.find((candidate) => candidate.provider.kind === kind) ?? null };
    const result = await findOverlappingTwitchSources(repository, target);
    expect(result?.streamerBotProviderId ?? null).toBe(expected);
  });
});

function record(kind: "twitch" | "streamerbot", active: boolean, forwardTwitchEvents?: boolean): ProviderRegistrationRecord {
  return {
    provider: {
      id: `provider-${kind}`, name: kind, kind, capability: "event-source", active, connectionState: "connected",
      intakeState: active ? "active" : "inactive", validatedAt: null, error: null, usedByAlertCount: 0
    },
    configuration: forwardTwitchEvents === undefined ? {} : { forwardTwitchEvents },
    availableVoices: [], secretRef: null, ttsSafety: null,
    createdAt: "2026-07-17T12:00:00.000Z", updatedAt: "2026-07-17T12:00:00.000Z"
  };
}
