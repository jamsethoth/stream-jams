import type {
  StreamerBotSubscriptionCatalog,
  StreamerBotSubscriptionUpdateInput
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { StreamerBotSubscriptionInactiveError } from "../../modules/providers/provider-management-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";

const catalog: StreamerBotSubscriptionCatalog = {
  providerId: "provider-streamerbot",
  available: true,
  sources: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }],
  selected: [],
  unavailableSelections: [],
  twitchBroadcasterId: null
};

describe("Streamer.bot subscription routes", () => {
  it("returns and updates the active provider's explicit subscriptions", async () => {
    const { app, headers, service } = await fixture();
    const input: StreamerBotSubscriptionUpdateInput = {
      twitchBroadcasterId: "broadcaster-1",
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    };

    const listed = await app.inject({
      method: "GET",
      url: "/providers/provider-streamerbot/streamerbot-subscriptions",
      headers
    });
    const updated = await app.inject({
      method: "PUT",
      url: "/providers/provider-streamerbot/streamerbot-subscriptions",
      headers: { ...headers, "content-type": "application/json" },
      payload: input
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(catalog);
    expect(updated.statusCode).toBe(200);
    expect(service.updates).toEqual([{ providerId: "provider-streamerbot", input }]);
  });

  it("rejects missing management authorization before service work", async () => {
    const { app, service } = await fixture();

    const response = await app.inject({
      method: "GET",
      url: "/providers/provider-streamerbot/streamerbot-subscriptions"
    });

    expect(response.statusCode).toBe(401);
    expect(service.listCount).toBe(0);
  });

  it("maps inactive providers and invalid request bodies to bounded errors", async () => {
    const { app, headers } = await fixture({ error: new StreamerBotSubscriptionInactiveError() });
    const inactive = await app.inject({
      method: "GET",
      url: "/providers/provider-streamerbot/streamerbot-subscriptions",
      headers
    });
    const invalid = await app.inject({
      method: "PUT",
      url: "/providers/provider-streamerbot/streamerbot-subscriptions",
      headers: { ...headers, "content-type": "application/json" },
      payload: { externalSubscriptions: [{ sourceKey: "OBS", eventTypes: [] }] }
    });

    expect(inactive.statusCode).toBe(409);
    expect(inactive.json()).toEqual({
      error: {
        code: "STREAMERBOT_SUBSCRIPTIONS_INACTIVE",
        message: "Only the active Streamer.bot provider can update subscriptions"
      }
    });
    expect(invalid.statusCode).toBe(400);
  });
});

async function fixture(options: { readonly error?: Error } = {}) {
  const service = new RecordingSubscriptionService(options.error);
  const sessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-09-08T12:00:00.000Z"),
    generateId: () => "mgmt-streamerbot-subscriptions",
    sessionTtlMs: 60_000
  });
  const session = await sessionService.createSession();
  const limiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-09-08T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    streamerBotSubscriptionService: service,
    managementAuthPreHandler: createTestManagementSecurity(sessionService),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter })
  });
  return {
    app,
    headers: managementTestHeaders(session, "POST"),
    service
  };
}

class RecordingSubscriptionService {
  listCount = 0;
  readonly updates: Array<{ providerId: string; input: StreamerBotSubscriptionUpdateInput }> = [];

  constructor(readonly error: Error | undefined) {}

  async getStreamerBotSubscriptions(): Promise<StreamerBotSubscriptionCatalog> {
    this.listCount += 1;
    if (this.error !== undefined) throw this.error;
    return catalog;
  }

  async updateStreamerBotSubscriptions(
    providerId: string,
    input: StreamerBotSubscriptionUpdateInput
  ): Promise<StreamerBotSubscriptionCatalog> {
    if (this.error !== undefined) throw this.error;
    this.updates.push({ providerId, input });
    return { ...catalog, selected: input.externalSubscriptions, twitchBroadcasterId: input.twitchBroadcasterId };
  }
}
