import type { NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { EventIngestionService } from "./event-ingestion-service.js";

describe("EventIngestionService", () => {
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
      message: "Duplicate Twitch EventSub message ignored"
    });
  });

  it("records malformed payloads without throwing or forwarding", async () => {
    const events: NormalizedStreamEvent[] = [];
    const service = new EventIngestionService({
      sink: {
        handleEvent(event) {
          events.push(event);
        }
      },
      now: () => new Date("2026-05-30T12:01:00.000Z")
    });

    await expect(service.ingestTwitchEventSubNotification({ metadata: { message_id: "bad-message" } })).resolves.toEqual({
      status: "rejected",
      message: "Twitch EventSub notification was invalid"
    });

    expect(events).toEqual([]);
    expect(service.getStatus()).toEqual({
      state: "degraded",
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 1,
      lastEventAt: null,
      lastErrorAt: "2026-05-30T12:01:00.000Z",
      message: "Twitch EventSub notification was invalid"
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
