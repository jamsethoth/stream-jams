import { describe, expect, it } from "vitest";
import { ingestProviderIdSchema } from "../events/schemas.js";
import { timerEventAdjustmentMs, timerEventRuleSchema } from "../timers/event-rules.js";
import { manualEventSubmissionSchema } from "./manual-submission.js";
import { busEventSchema } from "./schemas.js";
import { matchSelector } from "./selector.js";

const samplePayload = { userName: "Viewer" };
const document = {
  schemaVersion: 1, id: "alert", setId: "set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null, name: "Follow", enabled: true, conditions: [], durationMs: 1000,
  outputs: { browserSource: true, deviceRouteIds: [] }, layers: [], targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [] }, { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }], samplePayloads: [{ id: "sample", label: "Sample", kind: "session", payload: samplePayload }]
};

describe("manual submission contracts", () => {
  it.each([
    { kind: "alert-draft-test", request: { document, targetProfileId: "landscape", samplePayload, includeAudio: false, includeTts: false } },
    { kind: "alert-saved-test", alertId: "alert", targetProfileId: "vertical", samplePayload, includeAudio: true, includeTts: true },
    { kind: "effect-test", effectId: "effect", variantId: "variant", confirmLiveImpact: true },
    { kind: "video-request", request: { link: "https://youtu.be/dQw4w9WgXcQ", requester: "Viewer", durationSeconds: 30, autoplay: false } }
  ])("keeps selected action $kind explicit and validates its existing module input", action => {
    expect(manualEventSubmissionSchema.parse({ action }).action.kind).toBe(action.kind);
    expect(manualEventSubmissionSchema.safeParse({ action, recipients: ["desktop"] }).success).toBe(false);
    expect(manualEventSubmissionSchema.safeParse({ action: { ...action, authorization: "management" } }).success).toBe(false);
  });

  it("does not register Manual as an ingestion provider or allow forged manual provenance", () => {
    expect(ingestProviderIdSchema.safeParse("manual").success).toBe(false);
    const base = { sequence: 1, busId: "bus", eventId: "manual", receivedAt: "2026-10-10T12:00:00.000Z", kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null, effectTriggers: [], submission: { channel: "management", mayAutoplay: true }, action: { kind: "video-request", request: { link: "https://youtu.be/dQw4w9WgXcQ" } } };
    expect(busEventSchema.safeParse(base).success).toBe(true);
    expect(busEventSchema.safeParse({ ...base, sourceKind: "twitch" }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, sourceRegistrationId: "provider" }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, correlationKey: "twitch:follow:viewer" }).success).toBe(false);
    expect(matchSelector({ match: { kind: "canonical", type: "follow" }, sources: "any", conditions: [] }, busEventSchema.parse(base))).toBe(false);
  });

  it("extracts canonical counts for normal timer quantity rules without changing origin", () => {
    const time = "2026-10-10T12:00:00.000Z";
    const event = busEventSchema.parse({ sequence: 1, busId: "bus", eventId: "manual", receivedAt: time, kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null, effectTriggers: [], submission: { channel: "operator", mayAutoplay: true }, action: { kind: "simulate-canonical", event: { id: "manual", occurredAt: time, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", type: "cheer", actor: { id: null, displayName: "Viewer" }, message: null, amount: 250, metadata: {} } } });
    const rule = timerEventRuleSchema.parse({ enabled: true, selector: { match: { kind: "canonical", type: "cheer" }, sources: "any", conditions: [] }, action: "increment", amountMs: 5000, quantityUnit: 100, inactiveBehavior: "ignore" });
    expect(matchSelector(rule.selector, event)).toBe(true);
    expect(timerEventAdjustmentMs(rule, event)).toBe(10_000);
    expect(event.sourceKind).toBe("manual");
  });
});
