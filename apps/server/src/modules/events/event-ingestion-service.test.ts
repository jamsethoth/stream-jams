import type { NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { EventIngestionService } from "./event-ingestion-service.js";

describe("EventIngestionService", () => {
  it("ingests expanded direct Twitch events through the existing normalized path", async () => {
    const events: NormalizedStreamEvent[] = [];
    const service = new EventIngestionService({ sink: { handleEvent(event) { events.push(event); } } });
    const event: NormalizedStreamEvent = {
      id: "message-poll-end",
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "twitch",
      type: "poll_end",
      occurredAt: "2026-05-30T12:05:00.000Z",
      actor: { id: "broadcaster-1", displayName: "Streamer" },
      amount: 12,
      pollId: "poll-1",
      title: "What should we play?",
      choices: [{ id: "choice-1", title: "Game A", totalVotes: 12 }],
      totalVotes: 12,
      startedAt: "2026-05-30T12:00:00.000Z",
      endsAt: "2026-05-30T12:05:00.000Z",
      status: "completed",
      message: null,
      metadata: { twitchEventSubType: "channel.poll.end", twitchEventSubVersion: "1" }
    };

    await expect(service.ingestNormalizedEvent(event)).resolves.toEqual({ status: "accepted", event });
    expect(events).toEqual([event]);
  });

  it("forwards pre-normalized events once per deterministic event ID", async () => {
    const events: NormalizedStreamEvent[] = [];
    const service = new EventIngestionService({
      sink: {
        handleEvent(event) {
          events.push(event);
        }
      },
      now: () => new Date("2026-07-17T12:00:00.000Z")
    });
    const event: NormalizedStreamEvent = {
      id: "streamerbot:sha256:event-1",
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "streamerbot",
      type: "raid",
      occurredAt: "2026-07-17T11:59:59.000Z",
      actor: { id: "raider-1", displayName: "Raider" },
      amount: 42,
      message: null,
      metadata: { upstreamSource: "Twitch", upstreamType: "Raid" }
    };

    await expect(service.ingestNormalizedEvent(event)).resolves.toEqual({ status: "accepted", event });
    await expect(service.ingestNormalizedEvent(event)).resolves.toEqual({
      status: "duplicate",
      messageId: event.id
    });

    expect(events).toEqual([event]);
    expect(service.getStatus()).toEqual({
      state: "ready",
      acceptedCount: 1,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-07-17T12:00:00.000Z",
      lastErrorAt: null,
      message: "Duplicate normalized stream event ignored",
      referenceId: null
    });
  });

  it("normalizes and forwards Twitch EventSub messages once per message ID", async () => {
    const events: NormalizedStreamEvent[] = [];
    const service = new EventIngestionService({
      sink: {
        handleEvent(event) {
          events.push(event);
        }
      },
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });
    const message = followNotification("message-1");

    await expect(service.ingestTwitchEventSubNotification(message)).resolves.toMatchObject({
      status: "accepted",
      event: {
        id: "message-1",
        type: "follow"
      }
    });
    await expect(service.ingestTwitchEventSubNotification(message)).resolves.toEqual({
      status: "duplicate",
      messageId: "message-1"
    });

    expect(events).toHaveLength(1);
    expect(service.getStatus()).toEqual({
      state: "ready",
      acceptedCount: 1,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: "Duplicate Twitch EventSub message ignored",
      referenceId: null
    });
  });

  it("records malformed payloads without throwing or forwarding", async () => {
    const events: NormalizedStreamEvent[] = [];
    const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
    const service = new EventIngestionService({
      sink: {
        handleEvent(event) {
          events.push(event);
        }
      },
      now: () => new Date("2026-05-30T12:01:00.000Z"),
      generateReferenceId: () => "ref-ingestion-1",
      onDiagnostic(entry) {
        diagnostics.push(entry);
      }
    });

    await expect(service.ingestTwitchEventSubNotification({ metadata: { message_id: "bad-message" } })).resolves.toEqual({
      status: "rejected",
      message: "Twitch EventSub notification was invalid",
      referenceId: "ref-ingestion-1"
    });

    expect(events).toEqual([]);
    expect(service.getStatus()).toEqual({
      state: "degraded",
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 1,
      lastEventAt: null,
      lastErrorAt: "2026-05-30T12:01:00.000Z",
      message: "Twitch EventSub notification was invalid",
      referenceId: "ref-ingestion-1"
    });
    service.getStatus();
    service.getStatus();
    expect(diagnostics).toEqual([{
      message: "Twitch EventSub notification was invalid",
      referenceId: "ref-ingestion-1"
    }]);
  });

  it("allows a failed event delivery to be retried with the same event ID", async () => {
    let attempt = 0;
    const service = new EventIngestionService({
      sink: {
        handleEvent() {
          attempt += 1;
          if (attempt === 1) throw new Error("temporary sink failure");
        }
      },
      generateReferenceId: () => "ref-delivery-1",
      now: () => new Date("2026-07-17T12:00:00.000Z")
    });
    const event: NormalizedStreamEvent = {
      id: "streamerbot:sha256:retry-event",
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "streamerbot",
      type: "raid",
      occurredAt: "2026-07-17T11:59:59.000Z",
      actor: { id: "raider-1", displayName: "Raider" },
      amount: 42,
      message: null,
      metadata: {}
    };

    await expect(service.ingestNormalizedEvent(event)).resolves.toEqual({
      status: "rejected",
      message: "Normalized stream event ingestion failed",
      referenceId: "ref-delivery-1"
    });
    await expect(service.ingestNormalizedEvent(event)).resolves.toEqual({ status: "accepted", event });

    expect(attempt).toBe(2);
    expect(service.getStatus()).toMatchObject({
      state: "ready",
      acceptedCount: 1,
      duplicateCount: 0,
      rejectedCount: 1,
      referenceId: null
    });
  });
});

function followNotification(messageId: string) {
  return {
    metadata: {
      message_id: messageId,
      message_type: "notification",
      message_timestamp: "2026-05-30T12:00:00.000Z",
      subscription_type: "channel.follow",
      subscription_version: "2"
    },
    payload: {
      subscription: {
        id: "subscription-channel.follow",
        status: "enabled",
        type: "channel.follow",
        version: "2",
        cost: 0,
        condition: {
          broadcaster_user_id: "broadcaster-1"
        },
        transport: {
          method: "websocket",
          session_id: "session-1"
        },
        created_at: "2026-05-30T11:59:00.000Z"
      },
      event: {
        user_id: "user-1",
        user_login: "viewer",
        user_name: "Viewer",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        followed_at: "2026-05-30T12:00:00.000Z"
      }
    }
  };
}
