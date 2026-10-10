import { describe, expect, it } from "vitest";
import { busEventSchema } from "./schemas.js";

const follow = {
  id: "event-follow",
  type: "follow",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: "2026-10-08T12:00:00.000Z",
  actor: { id: "viewer-1", displayName: "Viewer" },
  message: null,
  amount: null,
  metadata: {}
};

const base = {
  sequence: 1,
  busId: "bus-1",
  eventId: "event-follow",
  sourceKind: "twitch",
  sourceRegistrationId: null,
  receivedAt: "2026-10-08T12:00:01.000Z",
  correlationKey: null,
  effectTriggers: []
};

const trigger = {
  kind: "streamerbot-event",
  eventId: "streamerbot:custom-1",
  occurredAt: "2026-10-08T12:00:00.000Z",
  providerId: "provider-streamerbot",
  sourceKey: "General",
  eventType: "Custom",
  summary: "Custom event"
};

describe("busEventSchema", () => {
  it("accepts canonical and external bus events", () => {
    expect(busEventSchema.parse({ ...base, kind: "canonical", event: follow }).kind).toBe("canonical");
    expect(busEventSchema.parse({ ...base, kind: "canonical", event: follow, correlationKey: "twitch:follow:viewer-1" }).correlationKey)
      .toBe("twitch:follow:viewer-1");
    expect(busEventSchema.parse({
      ...base, kind: "external", eventId: "streamerbot:custom-1", sourceKind: "streamerbot", effectTriggers: [trigger]
    }).kind).toBe("external");
  });

  it("rejects mismatched identities and unknown fields", () => {
    expect(busEventSchema.safeParse({ ...base, kind: "canonical", eventId: "other", event: follow }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, kind: "external", effectTriggers: [trigger] }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, kind: "external", overlayKey: "secret" }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, kind: "external", correlationKey: "twitch:follow:1" }).success).toBe(false);
  });

  it("rejects invalid sequence and source kind", () => {
    expect(busEventSchema.safeParse({ ...base, kind: "external", sequence: 0 }).success).toBe(false);
    expect(busEventSchema.safeParse({ ...base, kind: "external", sourceKind: "obs" }).success).toBe(false);
  });
});
