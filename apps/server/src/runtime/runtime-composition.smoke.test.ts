import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  moduleOverlayWebSocketPath,
  type AlertEditorDocument,
  type AlertRule,
  type AppConfig,
  type AppConfigUpdate,
  type ConfigStore,
  type OverlayInstruction
} from "@stream-jams/core";
import { createSequence, InMemorySecretStore } from "@stream-jams/test-support";
import { afterEach, describe, expect, it } from "vitest";
import type {
  TwitchApiClient,
  TwitchCurrentUser,
  TwitchDeviceAuthorizationRequest,
  TwitchDeviceTokenRequest,
  TwitchTokenGrant,
  TwitchValidatedToken
} from "../modules/twitch/twitch-api-client.js";
import {
  TwitchEventSubApiError,
  type TwitchEventSubApiClient,
  type TwitchEventSubCreateSubscriptionInput,
  type TwitchEventSubCreateSubscriptionResult,
  type TwitchEventSubSocket
} from "../modules/twitch/twitch-eventsub-client.js";
import type {
  OsCredentialAdapter
} from "../modules/security/os-secret-store.js";
import { runtimeSecretStoreUnavailableMessage } from "../modules/security/runtime-secret-store.js";
import type { StreamerBotSocket } from "../modules/streamerbot/streamerbot-client.js";
import type { SpeakerBotSocket } from "../modules/tts/speakerbot-client.js";
import { createRuntimeAppComposition, type RuntimeAppComposition } from "./runtime-composition.js";

const temporaryDirectories: string[] = [];
const runtimeCompositions: RuntimeAppComposition[] = [];

afterEach(async () => {
  await Promise.all(runtimeCompositions.splice(0).map((composition) => composition.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runtime app composition smoke", () => {
  it("restores playback protections before serving commands and persists later changes", async () => {
    const testRoot = await createTemporaryDirectory();
    const configStore = new StaticConfigStore(createConfig(testRoot, {
      paused: true,
      muted: true,
      doNotDisturb: true
    }));
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore,
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);

    expect((await composition.app.inject({ method: "GET", url: "/playback", headers: authHeaders })).json()).toMatchObject({
      paused: true,
      muted: true,
      doNotDisturb: true
    });
    expect((await composition.app.inject({ method: "POST", url: "/playback/unmute", headers: authHeaders })).json()).toMatchObject({
      muted: false
    });
    await expect(configStore.readConfig()).resolves.toMatchObject({ playback: { muted: false } });
  });

  it("indexes server failures by the public error ID returned to the browser", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: join(testRoot, "missing-web-dist"),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-07-20T01:00:00.000Z")
    });
    runtimeCompositions.push(composition);
    const failed = await composition.app.inject({ method: "GET", url: "/manage" });
    const errorId = (failed.json() as { readonly error: { readonly id: string } }).error.id;
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);

    expect(failed.statusCode).toBe(503);
    await waitFor(async () => {
      const response = await composition.app.inject({
        method: "GET",
        url: "/management/diagnostics/workspace",
        headers: authHeaders
      });
      const workspace = response.json() as { readonly rawLogs: readonly { readonly referenceId: string | null }[] };
      return workspace.rawLogs.some((entry) => entry.referenceId === errorId);
    });
  });

  it("records a blocked alert test before returning its public error ID", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-07-20T02:00:00.000Z")
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);
    await composition.app.inject({ method: "GET", url: "/management/home", headers: authHeaders });
    const rules = (await composition.app.inject({ method: "GET", url: "/alerts/rules", headers: authHeaders })).json() as AlertRule[];
    const followRule = rules.find((rule) => rule.eventType === "follow")!;
    const document = (await composition.app.inject({
      method: "GET",
      url: `/management/alerts/${followRule.id}/editor`,
      headers: authHeaders
    })).json() as AlertEditorDocument;
    const blockedDocument: AlertEditorDocument = {
      ...document,
      targetProfiles: document.targetProfiles.map((profile) =>
        profile.id === "landscape" ? { ...profile, enabled: false, reviewState: "needs-review" } : profile
      )
    };
    const failed = await composition.app.inject({
      method: "POST",
      url: `/management/alerts/${followRule.id}/editor/test`,
      headers: authHeaders,
      payload: {
        document: blockedDocument,
        targetProfileId: "landscape",
        samplePayload: document.samplePayloads[0]!.payload,
        includeAudio: false,
        includeTts: false
      }
    });
    const errorId = (failed.json() as { readonly error: { readonly id?: string } }).error.id;

    expect(failed.statusCode).toBe(409);
    expect(errorId).toMatch(/^err_/u);
    await waitFor(async () => {
      const response = await composition.app.inject({
        method: "GET",
        url: "/management/diagnostics/workspace",
        headers: authHeaders
      });
      const workspace = response.json() as {
        readonly problems: readonly {
          readonly area: string;
          readonly summary: string;
          readonly referenceId: string | null;
        }[];
      };
      return workspace.problems.some((problem) =>
        problem.referenceId === errorId
        && problem.area === "alerts"
        && problem.summary === "The alert test was not sent"
      );
    });
  });

  it("projects overlay playback failures into operator diagnostics", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-07-18T01:45:00.000Z")
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);
    const profileKey = await composition.overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape"
    });
    const messages: unknown[] = [];

    await composition.app.ready();
    const socket = await composition.app.injectWS(
      moduleOverlayWebSocketPath({
        moduleId: "alerts",
        purpose: "live",
        overlayKey: profileKey.rawKey,
        targetProfileId: "landscape"
      }),
      {},
      { onInit(webSocket) { webSocket.on("message", (data) => messages.push(JSON.parse(data.toString()) as unknown)); } }
    );
    await waitFor(() => messages.some((message) => isGatewayMessage(message, "overlay.connected")));

    socket.send(JSON.stringify({
      type: "overlay.playback.failed",
      instructionId: "instruction-audio-blocked",
      message: "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry."
    }));

    await waitFor(async () => {
      const response = await composition.app.inject({
        method: "GET",
        url: "/management/diagnostics/workspace",
        headers: authHeaders
      });
      const workspace = response.json() as { readonly rawLogs: readonly Record<string, unknown>[] };
      return workspace.rawLogs.some((entry) => entry.referenceId === "instruction-audio-blocked");
    });
    const workspace = (await composition.app.inject({
      method: "GET",
      url: "/management/diagnostics/workspace",
      headers: authHeaders
    })).json() as {
      readonly problems: readonly Record<string, unknown>[];
      readonly rawLogs: readonly Record<string, unknown>[];
    };

    expect(workspace.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "outputs",
        referenceId: "instruction-audio-blocked",
        summary: expect.stringContaining("Audio playback was blocked by the browser"),
        correction: expect.objectContaining({ label: "Open browser sources" })
      })
    ]));
    expect(workspace.rawLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "overlay.playback.failed",
        referenceId: "instruction-audio-blocked",
        message: expect.stringContaining("Audio playback was blocked by the browser")
      })
    ]));
    socket.close();
  });

  it("writes Twitch ingestion failures with the same source reference exposed by runtime status", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-07-17T12:00:00.000Z")
    });
    runtimeCompositions.push(composition);

    await composition.eventIngestionService.ingestTwitchEventSubNotification({
      metadata: {
        message_id: "malformed-message",
        subscription_type: "channel.subscribe"
      },
      secret: "must-not-be-logged"
    });
    const status = composition.eventIngestionService.getStatus();
    const logFiles = await readdir(join(testRoot, "data", "logs"));
    const log = await readFile(join(testRoot, "data", "logs", logFiles[0] ?? "missing"), "utf8");
    const entry = JSON.parse(log.trim()) as {
      readonly correlationId: string;
      readonly details: {
        readonly referenceId: string;
        readonly ingestProvider: string;
        readonly source: string;
        readonly subscriptionType: string;
      };
      readonly message: string;
    };

    expect(status.referenceId).toMatch(/^ref_/);
    expect(entry).toMatchObject({
      correlationId: status.referenceId,
      details: {
        referenceId: status.referenceId,
        ingestProvider: "twitch",
        source: "EventSub",
        subscriptionType: "channel.subscribe"
      },
      message: "Twitch EventSub notification was invalid"
    });
    expect(log).not.toContain("must-not-be-logged");
  });

  it("matches direct Twitch and Streamer.bot lifecycle and gift events while keeping intake running after malformed input", async () => {
    const testRoot = await createTemporaryDirectory();
    const streamerBotSockets: ControlledStreamerBotSocket[] = [];
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      streamerBotSocketFactory: () => {
        const socket = new ControlledStreamerBotSocket();
        streamerBotSockets.push(socket);
        return socket;
      },
      now: () => new Date("2026-07-18T02:00:00.000Z")
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);
    const registration = await composition.app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: {
        name: "Streamer.bot",
        kind: "streamerbot",
        configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
      }
    });
    const providerId = (registration.json() as { readonly provider: { readonly provider: { readonly id: string } } })
      .provider.provider.id;

    expect(registration.statusCode, registration.body).toBe(201);
    const activation = await composition.app.inject({
      method: "POST",
      url: `/management/providers/${providerId}/activate`,
      headers: authHeaders,
      payload: { confirmWarnings: false }
    });
    expect(activation.statusCode, activation.body).toBe(200);
    await waitFor(() => streamerBotSockets.length === 2);
    await waitFor(() => composition.streamerBotRuntimeService.getStatus().state === "connected");
    const sets = await composition.app.inject({ method: "GET", url: "/management/alert-sets", headers: authHeaders });
    const setId = (sets.json() as readonly { readonly id: string }[])[0]!.id;
    const streamOnlineAlert = await composition.app.inject({
      method: "POST",
      url: `/management/alert-sets/${setId}/alerts`,
      headers: authHeaders,
      payload: { eventType: "stream_online", name: "Stream online parity" }
    });
    const communityGiftAlert = await composition.app.inject({
      method: "POST",
      url: `/management/alert-sets/${setId}/alerts`,
      headers: authHeaders,
      payload: { eventType: "community_gift", name: "Community gift parity" }
    });
    const streamOnlineAlertId = (streamOnlineAlert.json() as { readonly id: string }).id;
    const communityGiftAlertId = (communityGiftAlert.json() as { readonly id: string }).id;

    expect(streamOnlineAlert.statusCode, streamOnlineAlert.body).toBe(201);
    expect(communityGiftAlert.statusCode, communityGiftAlert.body).toBe(201);
    expect((await composition.app.inject({
      method: "PATCH",
      url: `/management/alerts/${streamOnlineAlertId}/enabled`,
      headers: authHeaders,
      payload: { enabled: true }
    })).statusCode).toBe(200);
    expect((await composition.app.inject({
      method: "PATCH",
      url: `/management/alerts/${communityGiftAlertId}/enabled`,
      headers: authHeaders,
      payload: { enabled: true }
    })).statusCode).toBe(200);

    await streamerBotSockets[1]!.emitEvent({
      timeStamp: "2026-07-18T01:59:00.000Z",
      event: { source: "Twitch", type: "StreamOnline" },
      data: {
        id: "streamerbot-stream-online",
        broadcaster: { id: "streamer-1", name: "Streamer" },
        type: "live",
        startedAt: "2026-07-18T01:59:00.000Z"
      }
    });
    await expect(composition.eventIngestionService.ingestTwitchEventSubNotification({
      metadata: {
        message_id: "twitch-stream-online",
        message_type: "notification",
        message_timestamp: "2026-07-18T01:59:00.000Z",
        subscription_type: "stream.online",
        subscription_version: "1"
      },
      payload: {
        subscription: { id: "subscription-stream-online", type: "stream.online", version: "1", condition: {} },
        event: {
          id: "twitch-stream-online",
          broadcaster_user_id: "streamer-1",
          broadcaster_user_name: "Streamer",
          type: "live",
          started_at: "2026-07-18T01:59:00.000Z"
        }
      }
    })).resolves.toMatchObject({ status: "accepted", event: { type: "stream_online" } });

    await streamerBotSockets[1]!.emitEvent({
      timeStamp: "2026-07-18T02:00:00.000Z",
      event: { source: "Twitch", type: "GiftBomb" },
      data: { user: { id: "gifter-1", name: "Gifter" }, accessToken: "must-not-be-logged" }
    });
    const malformedStatus = composition.streamerBotRuntimeService.getStatus();
    const logFiles = await readdir(join(testRoot, "data", "logs"));
    const entries = (await readFile(join(testRoot, "data", "logs", logFiles[0] ?? "missing"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { readonly correlationId: string; readonly details?: Record<string, unknown> });

    expect(malformedStatus).toMatchObject({
      state: "degraded",
      referenceId: expect.any(String)
    });
    expect(entries).toEqual(expect.arrayContaining([expect.objectContaining({
      correlationId: malformedStatus.referenceId,
      details: {
        referenceId: malformedStatus.referenceId,
        upstreamSource: "Twitch",
        upstreamType: "GiftBomb"
      }
    })]));
    expect(JSON.stringify(entries)).not.toContain("must-not-be-logged");

    const acceptedBefore = composition.eventIngestionService.getStatus().acceptedCount;
    await streamerBotSockets[1]!.emitEvent({
      timeStamp: "2026-07-18T02:01:00.000Z",
      event: { source: "Twitch", type: "GiftBomb" },
      data: {
        id: "gift-bomb-after-malformed",
        user: { id: "gifter-1", name: "Gifter" },
        total: 5,
        sub_tier: "1000",
        cumulative_total: 20,
        createdAt: "2026-07-18T02:01:00.000Z"
      }
    });
    await expect(composition.eventIngestionService.ingestTwitchEventSubNotification({
      metadata: {
        message_id: "twitch-community-gift",
        message_type: "notification",
        message_timestamp: "2026-07-18T02:01:00.000Z",
        subscription_type: "channel.subscription.gift",
        subscription_version: "1"
      },
      payload: {
        subscription: {
          id: "subscription-community-gift",
          type: "channel.subscription.gift",
          version: "1",
          condition: {}
        },
        event: {
          user_id: "gifter-1",
          user_name: "Gifter",
          total: 5,
          tier: "1000",
          cumulative_total: 20,
          is_anonymous: false
        }
      }
    })).resolves.toMatchObject({ status: "accepted", event: { type: "community_gift" } });

    await waitFor(() => composition.eventIngestionService.getStatus().acceptedCount === acceptedBefore + 2);
    const diagnostics = await composition.app.inject({
      method: "GET",
      url: "/diagnostics?limit=20",
      headers: authHeaders
    });
    const alertMatchLogs = (diagnostics.json() as {
      readonly alertMatchLogs: readonly { readonly sourceEventId: string; readonly ruleId: string }[];
    }).alertMatchLogs;

    expect(alertMatchLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEventId: "twitch-stream-online", ruleId: streamOnlineAlertId }),
      expect.objectContaining({
        sourceEventId: "streamerbot:twitch:StreamOnline:streamerbot-stream-online",
        ruleId: streamOnlineAlertId
      }),
      expect.objectContaining({ sourceEventId: "twitch-community-gift", ruleId: communityGiftAlertId }),
      expect.objectContaining({
        sourceEventId: "streamerbot:twitch:GiftBomb:gift-bomb-after-malformed",
        ruleId: communityGiftAlertId
      })
    ]));
  });

  it("exposes synchronized Twitch and Streamer.bot event-source runtimes", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket
    });
    runtimeCompositions.push(composition);

    await composition.syncEventSourceRuntime();

    expect(composition.twitchEventSubRuntimeService.getStatus().state).toBe("idle");
    expect(composition.streamerBotRuntimeService.getStatus()).toMatchObject({
      state: "idle",
      activeProviderId: null,
      subscribedEventTypes: []
    });
  }, 30_000);

  it("switches persistent intake between Twitch and Streamer.bot without reauthorization", async () => {
    const testRoot = await createTemporaryDirectory();
    const credentials = new RecordingCredentialAdapter();
    let currentTime = new Date("2026-07-17T12:00:00.000Z");
    const twitchSockets: ControlledTwitchSocket[] = [];
    const streamerBotSockets: ControlledStreamerBotSocket[] = [];
    const eventSubApiClient = new RecordingTwitchEventSubApiClient();
    eventSubApiClient.failNextWithUnauthorized = true;
    const twitchApiClient = new RecordingTwitchApiClient();
    const recurringCallbacks: (() => void)[] = [];
    const recurringDelays: number[] = [];
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: credentials,
      environment: { TWITCH_CLIENT_ID: "test-client" },
      twitchApiClient,
      twitchEventSubApiClient: eventSubApiClient,
      twitchEventSubSocketFactory: () => {
        const socket = new ControlledTwitchSocket();
        twitchSockets.push(socket);
        return socket;
      },
      streamerBotSocketFactory: () => {
        const socket = new ControlledStreamerBotSocket();
        streamerBotSockets.push(socket);
        return socket;
      },
      scheduleRecurring(callback, delayMs) {
        recurringCallbacks.push(callback);
        recurringDelays.push(delayMs);
        return callback;
      },
      cancelRecurring() {},
      now: () => currentTime
    });
    runtimeCompositions.push(composition);

    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);
    const start = await composition.app.inject({ method: "POST", url: "/twitch/auth/start", headers: authHeaders });
    currentTime = new Date("2026-07-17T12:00:05.000Z");
    const poll = await composition.app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: (start.json() as { readonly authorizationId: string }).authorizationId }
    });
    expect(start.statusCode, start.body).toBe(200);
    expect(poll.statusCode, poll.body).toBe(200);
    expect(poll.json()).toMatchObject({ status: "connected" });
    const twitchRegistration = await composition.app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: { name: "Twitch", kind: "twitch", configuration: {} }
    });
    expect(twitchRegistration.statusCode, twitchRegistration.body).toBe(201);
    const twitchProviderId = (twitchRegistration.json() as {
      readonly provider: { readonly provider: { readonly id: string } };
    }).provider.provider.id;
    await waitFor(() => twitchSockets.length === 1);
    twitchSockets[0]?.emitWelcome();
    await waitFor(() => twitchApiClient.refreshRequests.length === 1 && twitchSockets.length === 2);
    twitchSockets[1]?.emitWelcome();
    await waitFor(() => eventSubApiClient.requests.length > 1);
    expect(recurringDelays).toEqual([60 * 60 * 1_000]);
    expect(twitchApiClient.validateRequests).toHaveLength(4);

    recurringCallbacks[0]?.();
    await waitFor(() => twitchApiClient.validateRequests.length === 5);
    expect(twitchSockets).toHaveLength(2);

    const sets = await composition.app.inject({ method: "GET", url: "/management/alert-sets", headers: authHeaders });
    const setId = (sets.json() as readonly { readonly id: string }[])[0]!.id;
    const setDetail = await composition.app.inject({ method: "GET", url: `/management/alert-sets/${setId}`, headers: authHeaders });
    expect((setDetail.json() as {
      readonly browserSources: readonly { readonly targetProfileId: string; readonly purpose: string }[];
    }).browserSources).toEqual([
      expect.objectContaining({ targetProfileId: "landscape", purpose: "live" }),
      expect.objectContaining({ targetProfileId: "vertical", purpose: "live" })
    ]);
    const alertId = (setDetail.json() as { readonly inventory: readonly { readonly id: string }[] }).inventory[0]!.id;
    const enabled = await composition.app.inject({
      method: "PATCH",
      url: `/management/alerts/${alertId}/enabled`,
      headers: authHeaders,
      payload: { enabled: true }
    });
    expect(enabled.statusCode).toBe(200);

    const streamerBotRegistration = await composition.app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: {
        name: "Streamer.bot",
        kind: "streamerbot",
        configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
      }
    });
    expect(streamerBotRegistration.statusCode).toBe(201);
    const streamerBotProviderId = (streamerBotRegistration.json() as {
      readonly provider: { readonly provider: { readonly id: string; readonly active: boolean } };
    }).provider.provider.id;
    expect(streamerBotRegistration.json()).toMatchObject({ provider: { provider: { active: false } } });

    const impact = await composition.app.inject({
      method: "GET",
      url: `/management/providers/${streamerBotProviderId}/activation-impact`,
      headers: authHeaders
    });
    expect(impact.json()).toEqual({
      matchedAlertCount: 1,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    });

    const activation = await composition.app.inject({
      method: "POST",
      url: `/management/providers/${streamerBotProviderId}/activate`,
      headers: authHeaders,
      payload: { confirmWarnings: false }
    });
    expect(activation.statusCode).toBe(200);
    await waitFor(() => streamerBotSockets.length === 2);
    await waitFor(() => composition.streamerBotRuntimeService.getStatus().state === "connected");
    expect(composition.twitchEventSubRuntimeService.getStatus().state).toBe("idle");
    const eventSources = await composition.app.inject({
      method: "GET",
      url: "/management/providers?capability=event-source",
      headers: authHeaders
    });
    expect(eventSources.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "twitch", active: false, liveStatus: "not-running" }),
      expect.objectContaining({ kind: "streamerbot", active: true, liveStatus: "healthy" })
    ]));
    const inactiveTwitchAuth = await composition.app.inject({
      method: "GET",
      url: "/twitch/auth/status",
      headers: authHeaders
    });
    expect(inactiveTwitchAuth.json()).toMatchObject({
      connected: true,
      account: { accountId: "141981764" }
    });
    expect(credentials.values.get("stream-jams:twitch:access_token:141981764")).toBe("access-token-2");
    expect(credentials.values.get("stream-jams:twitch:refresh_token:141981764")).toBe("refresh-token-2");

    await streamerBotSockets[1]!.emitEvent({
      timeStamp: "2026-07-17T12:04:00.000Z",
      event: { source: "Twitch", type: "Raid" },
      data: {
        user: { id: "user-raid", login: "raider", name: "Raider" },
        viewers: 42,
        createdAt: "2026-07-17T12:04:00.000Z"
      }
    });
    await waitFor(() => composition.eventIngestionService.getStatus().acceptedCount === 1);

    const twitchReactivation = await composition.app.inject({
      method: "POST",
      url: `/management/providers/${twitchProviderId}/activate`,
      headers: authHeaders,
      payload: { confirmWarnings: false }
    });
    expect(twitchReactivation.statusCode, twitchReactivation.body).toBe(200);
    await waitFor(() => twitchSockets.length === 3);
    twitchSockets[2]?.emitWelcome();
    await waitFor(() => composition.twitchEventSubRuntimeService.getStatus().state === "connected");
    expect(composition.streamerBotRuntimeService.getStatus().state).toBe("idle");
    expect(twitchApiClient.deviceStartRequests).toHaveLength(1);
    expect(twitchApiClient.devicePollRequests).toHaveLength(1);
    expect(twitchApiClient.refreshRequests).toHaveLength(1);
    const reactivatedSources = await composition.app.inject({
      method: "GET",
      url: "/management/providers?capability=event-source",
      headers: authHeaders
    });
    expect(reactivatedSources.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "twitch", active: true, liveStatus: "healthy" }),
      expect.objectContaining({ kind: "streamerbot", active: false, liveStatus: "not-running" })
    ]));
  });

  it("serves local runtime surfaces and representative adapters from one composition factory", async () => {
    const testRoot = await createTemporaryDirectory();
    const webBuildDirectory = await createWebBuildFixture(testRoot);
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory,
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      generateManagementSessionId: () => "mgmt_smoke-session",
      generateOverlayAccessKeyId: createSequence("overlay-key-smoke"),
      generateRawOverlayRouteKey: createSequence("ovl_smoke"),
      generateOverlayClientId: () => "overlay-client-smoke"
    });
    runtimeCompositions.push(composition);

    const app = composition.app;
    const session = await app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const authHeaders = managementAuthHeaders(session);
    const moduleKey = await composition.overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const unifiedKey = await composition.overlayAccessService.createKey({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified"
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    const management = await app.inject({ method: "GET", url: "/manage" });
    const builtScript = await app.inject({ method: "GET", url: "/assets/index-smoke.js" });
    const viteSource = await app.inject({ method: "GET", url: "/src/main.tsx" });
    const moduleOverlay = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${moduleKey.rawKey}`
    });
    const unifiedOverlay = await app.inject({
      method: "GET",
      url: `/overlay/unified/live/${unifiedKey.rawKey}`
    });
    const diagnostics = await app.inject({
      method: "GET",
      url: "/diagnostics?limit=5",
      headers: authHeaders
    });
    const playback = await app.inject({
      method: "GET",
      url: "/playback",
      headers: authHeaders
    });
    const overlayModules = await app.inject({
      method: "GET",
      url: "/overlay-modules",
      headers: authHeaders
    });
    const overlayModuleConfig = await app.inject({
      method: "GET",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders
    });
    const twitchStatus = await app.inject({
      method: "GET",
      url: "/twitch/eventsub/status",
      headers: authHeaders
    });
    const managementHome = await app.inject({
      method: "GET",
      url: "/management/home",
      headers: authHeaders
    });
    const eventSources = await app.inject({
      method: "GET",
      url: "/management/providers?capability=event-source",
      headers: authHeaders
    });
    const browserSpeechSetup = {
      name: "Built-in browser speech",
      kind: "browser-speech",
      configuration: {}
    };
    const browserSpeechValidation = await app.inject({
      method: "POST",
      url: "/management/providers/validate",
      headers: authHeaders,
      payload: browserSpeechSetup
    });
    const browserSpeechRegistration = await app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: browserSpeechSetup
    });
    const ttsProviders = await app.inject({
      method: "GET",
      url: "/management/providers?capability=tts",
      headers: authHeaders
    });

    expect(session.statusCode).toBe(201);
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: "ok",
      app: "stream-jams",
      version: "0.0.0"
    });
    expect(management.statusCode).toBe(200);
    expect(management.headers["content-type"]).toContain("text/html");
    expect(management.body).toContain('<script type="module" crossorigin src="/assets/index-smoke.js"></script>');
    expect(management.body).not.toContain("/src/main.tsx");
    expect(builtScript.statusCode).toBe(200);
    expect(builtScript.body).toBe("console.log('runtime smoke');");
    expect(viteSource.statusCode).toBe(404);
    expect(moduleOverlay.statusCode).toBe(200);
    expect(moduleOverlay.body).toContain('<script type="module" crossorigin src="/assets/index-smoke.js"></script>');
    expect(moduleOverlay.body).not.toContain(moduleKey.rawKey);
    expect(unifiedOverlay.statusCode).toBe(200);
    expect(unifiedOverlay.body).toContain('<script type="module" crossorigin src="/assets/index-smoke.js"></script>');
    expect(unifiedOverlay.body).not.toContain(unifiedKey.rawKey);
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json()).toMatchObject({
      eventLogs: [],
      alertMatchLogs: [],
      playbackLogs: [],
      providerErrors: []
    });
    expect(playback.statusCode).toBe(200);
    expect(playback.json()).toMatchObject({
      current: null,
      queued: []
    });
    expect(overlayModules.statusCode).toBe(200);
    expect(overlayModules.json()).toEqual([
      expect.objectContaining({
        id: "alerts",
        displayName: "Alerts"
      })
    ]);
    expect(overlayModuleConfig.statusCode).toBe(200);
    expect(overlayModuleConfig.json()).toMatchObject({
      moduleId: "alerts",
      enabled: true,
      config: {
        canvas: {
          width: 1920,
          height: 1080
        }
      }
    });
    expect(twitchStatus.statusCode).toBe(200);
    expect(twitchStatus.json()).toMatchObject({
      state: "idle",
      connectionState: "idle",
      sessionId: null,
      subscriptionTypes: []
    });
    expect(managementHome.statusCode).toBe(200);
    expect(managementHome.json()).toMatchObject({
      activeAlertSet: expect.objectContaining({ name: "Default", active: true, starter: true }),
      actionableProblems: [],
      readiness: expect.arrayContaining([
        expect.objectContaining({ id: "event-source", state: "action-required" }),
        expect.objectContaining({ id: "tts-provider", state: "action-required" }),
        expect.objectContaining({ id: "starter-alert-set", state: "action-required" })
      ])
    });
    expect(eventSources.statusCode).toBe(200);
    expect(eventSources.json()).toEqual([]);
    expect(browserSpeechValidation.statusCode).toBe(200);
    expect(browserSpeechValidation.json()).toMatchObject({ valid: true, connectionState: "connected" });
    expect(browserSpeechRegistration.statusCode).toBe(201);
    expect(browserSpeechRegistration.json()).toMatchObject({
      status: "registered",
      provider: { provider: { kind: "browser-speech", active: true } }
    });
    expect(ttsProviders.statusCode).toBe(200);
    expect(ttsProviders.json()).toEqual([
      expect.objectContaining({ kind: "browser-speech", active: true, connectionState: "connected" })
    ]);

    await app.ready();
    let resolveConnectedMessage: (value: unknown) => void = () => undefined;
    const connectedMessage = new Promise((resolve) => {
      resolveConnectedMessage = resolve;
    });
    const socket = await app.injectWS(`/overlay/ws/modules/alerts/live/${moduleKey.rawKey}`, {}, {
      onInit(webSocket) {
        webSocket.once("message", (data) => resolveConnectedMessage(JSON.parse(data.toString()) as unknown));
      }
    });

    await expect(connectedMessage).resolves.toMatchObject({
      type: "overlay.connected",
      clientId: "overlay-client-smoke",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    socket.close();
  });

  it("delivers saved editor layers from a real event to the matching live profile client", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-07-16T12:00:00.000Z"),
      generateManagementSessionId: () => "mgmt_live-editor",
      generateOverlayAccessKeyId: () => "overlay-key-live-editor",
      generateRawOverlayRouteKey: () => "ovl_live-editor",
      generateOverlayClientId: createSequence("overlay-client-live-editor")
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);
    await composition.app.inject({ method: "GET", url: "/management/home", headers: authHeaders });
    const rules = (await composition.app.inject({ method: "GET", url: "/alerts/rules", headers: authHeaders })).json() as AlertRule[];
    const followRule = rules.find((rule) => rule.eventType === "follow")!;
    const document = (await composition.app.inject({
      method: "GET",
      url: `/management/alerts/${followRule.id}/editor`,
      headers: authHeaders
    })).json() as AlertEditorDocument;
    const primaryLayer = document.layers.find((layer) => layer.type === "text")!;
    const editedDocument: AlertEditorDocument = {
      ...document,
      enabled: true,
      layers: [
        { ...primaryLayer, name: "Primary", order: 0, template: "Primary {actor.displayName}" },
        { ...primaryLayer, id: "layer-secondary", name: "Secondary", order: 1, template: "Secondary {actor.displayName}" }
      ],
      targetProfiles: document.targetProfiles.map((profile) =>
        profile.id === "landscape"
          ? {
              ...profile,
              enabled: true,
              reviewState: "ready",
              layerLayouts: [
                { layerId: primaryLayer.id, x: 100, y: 120, width: 500, height: 100, zIndex: 2 },
                { layerId: "layer-secondary", x: 300, y: 400, width: 600, height: 120, zIndex: 3 }
              ]
            }
          : { ...profile, enabled: false, reviewState: "needs-review" }
      )
    };
    const save = await composition.app.inject({
      method: "PUT",
      url: `/management/alerts/${followRule.id}/editor`,
      headers: authHeaders,
      payload: { document: editedDocument, confirmLiveImpact: true }
    });
    expect(save.statusCode).toBe(200);

    const profileKey = await composition.overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape"
    });
    await composition.app.ready();
    const firstClientMessages: unknown[] = [];
    const firstSocket = await composition.app.injectWS(
      moduleOverlayWebSocketPath({
        moduleId: "alerts",
        purpose: "live",
        overlayKey: profileKey.rawKey,
        targetProfileId: "landscape"
      }),
      {},
      { onInit(webSocket) { webSocket.on("message", (data) => firstClientMessages.push(JSON.parse(data.toString()) as unknown)); } }
    );
    const secondClientMessages: unknown[] = [];
    const secondSocket = await composition.app.injectWS(
      moduleOverlayWebSocketPath({
        moduleId: "alerts",
        purpose: "live",
        overlayKey: profileKey.rawKey,
        targetProfileId: "landscape"
      }),
      {},
      { onInit(webSocket) { webSocket.on("message", (data) => secondClientMessages.push(JSON.parse(data.toString()) as unknown)); } }
    );
    await waitFor(() =>
      firstClientMessages.some((message) => isGatewayMessage(message, "overlay.connected")) &&
      secondClientMessages.some((message) => isGatewayMessage(message, "overlay.connected"))
    );

    const ingestion = await (composition as RuntimeAppComposition & {
      readonly eventIngestionService: { ingestTwitchEventSubNotification(message: unknown): Promise<{ readonly status: string }> };
    }).eventIngestionService.ingestTwitchEventSubNotification(followNotification("live-editor-follow"));
    await waitFor(() =>
      firstClientMessages.filter((message) => isGatewayMessage(message, "overlay.playback")).length === 2 &&
      secondClientMessages.filter((message) => isGatewayMessage(message, "overlay.playback")).length === 2
    );

    expect(ingestion.status).toBe("accepted");
    expect(firstClientMessages.filter((message): message is { readonly type: "overlay.playback"; readonly instruction: OverlayInstruction } =>
      isGatewayMessage(message, "overlay.playback")
    ).map((message) => ({
      targetProfileId: message.instruction.targetProfileId,
      text: message.instruction.text?.text,
      layout: message.instruction.text?.layout
    }))).toEqual([
      {
        targetProfileId: "landscape",
        text: "Primary Viewer",
        layout: { layerId: primaryLayer.id, x: 100, y: 120, width: 500, height: 100, zIndex: 2 }
      },
      {
        targetProfileId: "landscape",
        text: "Secondary Viewer",
        layout: { layerId: "layer-secondary", x: 300, y: 400, width: 600, height: 120, zIndex: 3 }
      }
    ]);
    const deliveredInstructions = firstClientMessages.filter((message): message is { readonly type: "overlay.playback"; readonly instruction: OverlayInstruction } =>
      isGatewayMessage(message, "overlay.playback")
    ).map((message) => message.instruction);
    firstSocket.send(JSON.stringify({
      type: "overlay.playback.completed",
      instructionId: deliveredInstructions[0]!.id
    }));
    firstSocket.send(JSON.stringify({
      type: "overlay.playback.completed",
      instructionId: deliveredInstructions[0]!.id
    }));
    firstSocket.send(JSON.stringify({
      type: "overlay.playback.completed",
      instructionId: deliveredInstructions[1]!.id
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await composition.app.inject({ method: "GET", url: "/playback", headers: authHeaders })).json().current).not.toBeNull();
    secondSocket.terminate();
    await waitFor(async () => (await composition.app.inject({ method: "GET", url: "/playback", headers: authHeaders })).json().current === null);
    firstSocket.close();
  });

  it("sends one Speaker.bot request for an alert enabled on both target profiles", async () => {
    const testRoot = await createTemporaryDirectory();
    const speakerBotRequests: Record<string, unknown>[] = [];
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      speakerBotSocketFactory: (url) => new RecordingSpeakerBotSocket(url, speakerBotRequests),
      now: () => new Date("2026-07-18T12:00:00.000Z")
    });
    runtimeCompositions.push(composition);
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const authHeaders = managementAuthHeaders(session);

    const registration = await composition.app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: {
        name: "Speaker.bot",
        kind: "speakerbot",
        configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" }
      }
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const providerId = (registration.json() as {
      readonly provider: { readonly provider: { readonly id: string; readonly active: boolean } };
    }).provider.provider.id;
    expect(registration.json()).toMatchObject({ provider: { provider: { active: true } } });
    const safety = await composition.app.inject({
      method: "PUT",
      url: `/management/providers/${providerId}/tts-safety`,
      headers: authHeaders,
      payload: {
        defaultVoiceId: "EventVoice",
        volume: 1,
        minimumRate: 0.8,
        maximumRate: 1.2,
        maximumTextLength: 280
      }
    });
    expect(safety.statusCode, safety.body).toBe(200);

    await composition.app.inject({ method: "GET", url: "/management/home", headers: authHeaders });
    const rules = (await composition.app.inject({
      method: "GET",
      url: "/alerts/rules",
      headers: authHeaders
    })).json() as AlertRule[];
    const followRule = rules.find((rule) => rule.eventType === "follow")!;
    const document = (await composition.app.inject({
      method: "GET",
      url: `/management/alerts/${followRule.id}/editor`,
      headers: authHeaders
    })).json() as AlertEditorDocument;
    const ttsLayerId = `${followRule.id}-tts`;
    const editedDocument: AlertEditorDocument = {
      ...document,
      enabled: true,
      layers: [
        ...document.layers,
        {
          id: ttsLayerId,
          name: "Text to speech",
          type: "tts",
          visible: true,
          enabled: true,
          providerId: "speakerbot",
          order: document.layers.length,
          animation: document.layers[0]!.animation,
          template: "Welcome {actor.displayName}"
        }
      ],
      targetProfiles: document.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "ready"
      })) as AlertEditorDocument["targetProfiles"]
    };
    const save = await composition.app.inject({
      method: "PUT",
      url: `/management/alerts/${followRule.id}/editor`,
      headers: authHeaders,
      payload: { document: editedDocument, confirmLiveImpact: true }
    });
    expect(save.statusCode, save.body).toBe(200);

    const ingestion = await composition.eventIngestionService.ingestTwitchEventSubNotification(
      followNotification("speakerbot-two-profiles")
    );
    expect(ingestion.status).toBe("accepted");
    const speakRequests = speakerBotRequests.filter((request) => request.request === "Speak");
    expect(speakRequests).toEqual([
      expect.objectContaining({
        request: "Speak",
        voice: "EventVoice",
        message: "Welcome Viewer",
        badWordFilter: true
      })
    ]);
  });

  it("uses the exact default Twitch Client ID or a trimmed override without a client secret", async () => {
    const defaultRoot = await createTemporaryDirectory();
    const defaultClient = new RecordingTwitchApiClient();
    const defaultComposition = await createRuntimeAppComposition({
      homeDirectory: defaultRoot,
      webBuildDirectory: await createWebBuildFixture(defaultRoot),
      configStore: new StaticConfigStore(createConfig(defaultRoot)),
      environment: {},
      secretStore: new InMemorySecretStore(),
      twitchApiClient: defaultClient,
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket
    });
    runtimeCompositions.push(defaultComposition);
    const defaultSession = await defaultComposition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const defaultStart = await defaultComposition.app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: managementAuthHeaders(defaultSession)
    });

    const overrideRoot = await createTemporaryDirectory();
    const overrideClient = new RecordingTwitchApiClient();
    const overrideComposition = await createRuntimeAppComposition({
      homeDirectory: overrideRoot,
      webBuildDirectory: await createWebBuildFixture(overrideRoot),
      configStore: new StaticConfigStore(createConfig(overrideRoot)),
      environment: { TWITCH_CLIENT_ID: "  override-client-id  " },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: overrideClient,
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket
    });
    runtimeCompositions.push(overrideComposition);
    const overrideSession = await overrideComposition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const overrideStart = await overrideComposition.app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: managementAuthHeaders(overrideSession)
    });

    expect(defaultStart.statusCode).toBe(200);
    expect(defaultClient.deviceStartRequests[0]?.clientId).toBe("r6jy78npqxcqe68xpsctkcecti6ba3");
    expect(overrideStart.statusCode).toBe(200);
    expect(overrideClient.deviceStartRequests[0]?.clientId).toBe("override-client-id");
  });

  it("persists overlay module config across runtime restart", async () => {
    const testRoot = await createTemporaryDirectory();
    const firstComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      generateManagementSessionId: () => "mgmt_module-config-restart"
    });
    runtimeCompositions.push(firstComposition);

    const session = await firstComposition.app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const authHeaders = managementAuthHeaders(session);
    const saved = await firstComposition.app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: false,
        config: {
          canvas: {
            width: 1280,
            height: 720
          }
        }
      }
    });

    expect(saved.statusCode).toBe(200);
    await firstComposition.close();
    runtimeCompositions.splice(runtimeCompositions.indexOf(firstComposition), 1);

    const secondComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      secretStore: new InMemorySecretStore(),
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-06-16T12:05:00.000Z"),
      generateManagementSessionId: () => "mgmt_module-config-restarted"
    });
    runtimeCompositions.push(secondComposition);

    const restartedSession = await secondComposition.app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const restartedAuthHeaders = managementAuthHeaders(restartedSession);
    const restored = await secondComposition.app.inject({
      method: "GET",
      url: "/overlay-modules/alerts/config",
      headers: restartedAuthHeaders
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      }
    });
  });

  it("uses the durable credential adapter path for normal development and production runtimes", async () => {
    for (const nodeEnv of ["development", "production"] as const) {
      const testRoot = await createTemporaryDirectory();
      const credentials = new RecordingCredentialAdapter();
      const composition = await createRuntimeAppComposition({
        homeDirectory: testRoot,
        webBuildDirectory: await createWebBuildFixture(testRoot),
        configStore: new StaticConfigStore(createConfig(testRoot)),
        credentialAdapter: credentials,
        environment: { NODE_ENV: nodeEnv, TWITCH_CLIENT_ID: "test-client" },
        twitchApiClient: new ThrowingTwitchApiClient(),
        twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
        twitchEventSubSocketFactory: createForbiddenTwitchSocket,
        now: () => new Date("2026-06-16T12:00:00.000Z")
      });
      runtimeCompositions.push(composition);

      expect(composition.runtimeSecretStoreStatus.state).toBe("ready");
      expect(credentials.operations.map((operation) => operation.kind)).toEqual(["set", "get", "delete"]);
    }
  });

  it("keeps the app available but fails Twitch OAuth closed when credential storage is unavailable", async () => {
    const testRoot = await createTemporaryDirectory();
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: new FailingCredentialAdapter(),
      environment: { TWITCH_CLIENT_ID: "test-client" },
      twitchApiClient: new ThrowingTwitchApiClient(),
      twitchEventSubApiClient: new ThrowingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      generateManagementSessionId: () => "mgmt_unavailable-secret-store"
    });
    runtimeCompositions.push(composition);

    const app = composition.app;
    const session = await app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const authHeaders = managementAuthHeaders(session);
    const diagnostics = await app.inject({
      method: "GET",
      url: "/diagnostics?limit=5",
      headers: authHeaders
    });
    const start = await app.inject({ method: "POST", url: "/twitch/auth/start", headers: authHeaders });

    expect(composition.runtimeSecretStoreStatus).toEqual({
      state: "degraded",
      lastErrorAt: "2026-06-16T12:00:00.000Z",
      message: runtimeSecretStoreUnavailableMessage
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json()).toMatchObject({
      providerErrors: [
        expect.objectContaining({
          providerId: "runtime-secret-store",
          label: "Runtime secret store",
          message: runtimeSecretStoreUnavailableMessage
        })
      ]
    });
    expect(start.statusCode).toBe(502);
    expect(start.json()).toMatchObject({
      error: {
        code: "TWITCH_OAUTH_PROVIDER_ERROR",
        message: "Twitch account authorization failed"
      }
    });
  });

  it("persists device-authorized Twitch tokens and keeps the EventSub connection callback", async () => {
    const testRoot = await createTemporaryDirectory();
    const credentials = new RecordingCredentialAdapter();
    let currentTime = new Date("2026-06-16T12:00:00.000Z");
    const firstEventSubApiClient = new RecordingTwitchEventSubApiClient();
    const firstSockets: ControlledTwitchSocket[] = [];
    const firstComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: credentials,
      environment: { TWITCH_CLIENT_ID: "  test-client  " },
      twitchApiClient: new RecordingTwitchApiClient(),
      twitchEventSubApiClient: firstEventSubApiClient,
      twitchEventSubSocketFactory: () => {
        const socket = new ControlledTwitchSocket();
        firstSockets.push(socket);
        return socket;
      },
      now: () => currentTime,
      generateManagementSessionId: () => "mgmt_restart-secret-store"
    });
    runtimeCompositions.push(firstComposition);

    const firstApp = firstComposition.app;
    const session = await firstApp.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const authHeaders = managementAuthHeaders(session);
    const start = await firstApp.inject({ method: "POST", url: "/twitch/auth/start", headers: authHeaders });
    currentTime = new Date("2026-06-16T12:00:05.000Z");
    const poll = await firstApp.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: (start.json() as { readonly authorizationId: string }).authorizationId }
    });
    const diagnosticsExport = await firstApp.inject({
      method: "GET",
      url: "/diagnostics/export?limit=5",
      headers: authHeaders
    });

    expect(start.statusCode).toBe(200);
    expect(poll.statusCode).toBe(200);
    expect(start.json()).toMatchObject({
      scopes: [
        "bits:read",
        "channel:read:hype_train",
        "channel:read:polls",
        "channel:read:predictions",
        "channel:read:redemptions",
        "channel:read:subscriptions",
        "moderator:read:followers"
      ]
    });
    expect(poll.json()).toMatchObject({
      status: "connected",
      connection: { authorizationState: "ready", missingScopes: [] }
    });
    expect(credentials.values.get("stream-jams:twitch:access_token:141981764")).toBe("access-token-1");
    expect(credentials.values.get("stream-jams:twitch:refresh_token:141981764")).toBe("refresh-token-1");
    expect(JSON.stringify(diagnosticsExport.json())).not.toContain("access-token-1");
    expect(JSON.stringify(diagnosticsExport.json())).not.toContain("refresh-token-1");
    const registration = await firstApp.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: { name: "Twitch", kind: "twitch", configuration: {} }
    });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toMatchObject({ status: "registered", provider: { provider: { active: true } } });
    await waitFor(() => firstSockets.length > 0);
    firstSockets[0]?.emitWelcome();
    await waitFor(() => firstEventSubApiClient.requests.length > 0);
    expect(firstEventSubApiClient.requests[0]?.clientId).toBe("test-client");

    firstSockets[0]?.emitNotification(followNotification("active-provider-event"));
    await waitFor(() => firstComposition.eventIngestionService.getStatus().acceptedCount === 1);

    const providerId = (registration.json() as { readonly provider: { readonly provider: { readonly id: string } } }).provider.provider.id;
    const deactivation = await firstApp.inject({
      method: "POST",
      url: `/management/providers/${providerId}/deactivate`,
      headers: authHeaders
    });
    expect(deactivation.statusCode).toBe(200);

    firstSockets[0]?.emitNotification(followNotification("inactive-provider-event"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(firstComposition.eventIngestionService.getStatus().acceptedCount).toBe(1);

    await firstComposition.close();
    runtimeCompositions.splice(runtimeCompositions.indexOf(firstComposition), 1);

    const eventSubApiClient = new RecordingTwitchEventSubApiClient();
    const sockets: ControlledTwitchSocket[] = [];
    const secondComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: credentials,
      environment: { TWITCH_CLIENT_ID: "test-client" },
      twitchApiClient: new RecordingTwitchApiClient(),
      twitchEventSubApiClient: eventSubApiClient,
      twitchEventSubSocketFactory: () => {
        const socket = new ControlledTwitchSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => new Date("2026-06-16T12:05:00.000Z")
    });
    runtimeCompositions.push(secondComposition);

    await secondComposition.twitchEventSubRuntimeService.connectStoredAccount();
    sockets[0]?.emitWelcome();
    await waitFor(() => eventSubApiClient.requests.length > 0);

    expect(eventSubApiClient.requests[0]?.accessToken).toBe("access-token-1");
  });
});

async function createWebBuildFixture(testRoot: string): Promise<string> {
  const webBuildDirectory = join(testRoot, "web-dist");
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.js"), "console.log('runtime smoke');", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.css"), "body { color: black; }", "utf8");
  await writeFile(
    join(webBuildDirectory, ".vite", "manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/index-smoke.js",
        isEntry: true,
        css: ["assets/index-smoke.css"]
      }
    }),
    "utf8"
  );

  return webBuildDirectory;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-runtime-smoke-"));
  temporaryDirectories.push(directory);
  return directory;
}

function managementAuthHeaders(sessionResponse: { json(): unknown }): {
  readonly authorization: string;
  readonly "x-stream-jams-csrf": string;
} {
  const session = sessionResponse.json() as { readonly id: string; readonly csrfToken: string };
  return {
    authorization: `Bearer ${session.id}`,
    "x-stream-jams-csrf": session.csrfToken
  };
}

function createConfig(
  testRoot: string,
  playback = { paused: false, muted: false, doNotDisturb: false }
): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 39187
    },
    storage: {
      dataDirectory: join(testRoot, "data"),
      assetDirectory: join(testRoot, "assets")
    },
    logging: {
      level: "INFO",
      rollover: "hourly",
      retentionHours: 48
    },
    playback
  };
}

class StaticConfigStore implements ConfigStore {
  constructor(private config: AppConfig) {}

  async readConfig(): Promise<AppConfig> {
    return this.config;
  }

  async updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    this.config = {
      server: {
        host: patch.server?.host ?? this.config.server.host,
        port: patch.server?.port ?? this.config.server.port
      },
      storage: {
        dataDirectory: patch.storage?.dataDirectory ?? this.config.storage.dataDirectory,
        assetDirectory: patch.storage?.assetDirectory ?? this.config.storage.assetDirectory
      },
      logging: {
        level: patch.logging?.level ?? this.config.logging.level,
        rollover: patch.logging?.rollover ?? this.config.logging.rollover,
        retentionHours: patch.logging?.retentionHours ?? this.config.logging.retentionHours
      },
      playback: {
        paused: patch.playback?.paused ?? this.config.playback.paused,
        muted: patch.playback?.muted ?? this.config.playback.muted,
        doNotDisturb: patch.playback?.doNotDisturb ?? this.config.playback.doNotDisturb
      }
    };
    return this.config;
  }
}

class RecordingCredentialAdapter implements OsCredentialAdapter {
  readonly operations: { readonly kind: "set" | "get" | "delete"; readonly service: string; readonly account: string }[] = [];
  readonly values = new Map<string, string>();

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.operations.push({ kind: "set", service, account });
    this.values.set(secretKeyFromCredential(service, account), password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    this.operations.push({ kind: "get", service, account });
    return this.values.get(secretKeyFromCredential(service, account)) ?? null;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    this.operations.push({ kind: "delete", service, account });
    return this.values.delete(secretKeyFromCredential(service, account));
  }
}

class FailingCredentialAdapter implements OsCredentialAdapter {
  async setPassword(): Promise<void> {
    throw new Error("secret service unavailable");
  }

  async getPassword(): Promise<string | null> {
    throw new Error("secret service unavailable");
  }

  async deletePassword(): Promise<boolean> {
    throw new Error("secret service unavailable");
  }
}

class RecordingTwitchApiClient implements TwitchApiClient {
  readonly deviceStartRequests: TwitchDeviceAuthorizationRequest[] = [];
  readonly devicePollRequests: TwitchDeviceTokenRequest[] = [];
  readonly validateRequests: { readonly accessToken: string }[] = [];
  readonly refreshRequests: Parameters<TwitchApiClient["refreshUserToken"]>[0][] = [];

  async startDeviceAuthorization(input: TwitchDeviceAuthorizationRequest) {
    this.deviceStartRequests.push(input);
    return {
      deviceCode: "device-code-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresIn: 600,
      interval: 5
    };
  }

  async pollDeviceAuthorization(input: TwitchDeviceTokenRequest) {
    this.devicePollRequests.push(input);
    return {
      status: "granted" as const,
      grant: {
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        expiresIn: 14_400,
        scopes: ["bits:read", "channel:read:hype_train", "channel:read:polls", "channel:read:predictions", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"],
        tokenType: "bearer" as const
      }
    };
  }

  async refreshUserToken(input: Parameters<TwitchApiClient["refreshUserToken"]>[0]): Promise<TwitchTokenGrant> {
    this.refreshRequests.push(input);
    return {
      accessToken: "access-token-2",
      refreshToken: "refresh-token-2",
      expiresIn: 14_400,
      scopes: ["bits:read", "channel:read:hype_train", "channel:read:polls", "channel:read:predictions", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"],
      tokenType: "bearer"
    };
  }

  async validateToken(input: { readonly accessToken: string }): Promise<TwitchValidatedToken> {
    this.validateRequests.push(input);
    return {
      clientId: "test-client",
      login: "streamer",
      scopes: ["bits:read", "channel:read:hype_train", "channel:read:polls", "channel:read:predictions", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"],
      userId: "141981764",
      expiresIn: 14_000
    };
  }

  async getCurrentUser(): Promise<TwitchCurrentUser> {
    return {
      id: "141981764",
      login: "streamer",
      displayName: "Streamer"
    };
  }
}

class RecordingTwitchEventSubApiClient implements TwitchEventSubApiClient {
  readonly requests: TwitchEventSubCreateSubscriptionInput[] = [];
  failNextWithUnauthorized = false;

  async createSubscription(input: TwitchEventSubCreateSubscriptionInput): Promise<TwitchEventSubCreateSubscriptionResult> {
    this.requests.push(input);
    if (this.failNextWithUnauthorized) {
      this.failNextWithUnauthorized = false;
      throw new TwitchEventSubApiError(401);
    }
    return {
      id: "subscription-" + this.requests.length,
      status: "enabled",
      type: input.subscription.type
    };
  }
}

class ControlledTwitchSocket implements TwitchEventSubSocket {
  readonly #messageListeners: ((event: { readonly data: unknown }) => void)[] = [];
  readonly #closeListeners: ((event: { readonly code?: number; readonly reason?: string }) => void)[] = [];

  addEventListener(
    event: "open" | "message" | "close" | "error",
    listener: (event: never) => void
  ): void {
    if (event === "message") {
      this.#messageListeners.push(listener as (event: { readonly data: unknown }) => void);
    }

    if (event === "close") {
      this.#closeListeners.push(listener as (event: { readonly code?: number; readonly reason?: string }) => void);
    }
  }

  emitWelcome(): void {
    for (const listener of this.#messageListeners) {
      listener({
        data: {
          metadata: {
            message_id: "message-1",
            message_type: "session_welcome",
            message_timestamp: "2026-06-16T12:05:00.000Z"
          },
          payload: {
            session: {
              id: "session-1",
              status: "connected",
              connected_at: "2026-06-16T12:05:00.000Z",
              reconnect_url: null
            }
          }
        }
      });
    }
  }

  emitNotification(notification: unknown): void {
    for (const listener of this.#messageListeners) {
      listener({ data: notification });
    }
  }

  close(): void {
    for (const listener of this.#closeListeners) {
      listener({ code: 1000, reason: "closed" });
    }
  }
}

class ControlledStreamerBotSocket implements StreamerBotSocket {
  readonly #messageListeners: ((event: { readonly data: unknown }) => void | Promise<void>)[] = [];
  readonly #closeListeners: ((event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>)[] = [];
  #helloScheduled = false;

  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event === "message") {
      this.#messageListeners.push(listener as (event: { readonly data: unknown }) => void | Promise<void>);
      if (!this.#helloScheduled) {
        this.#helloScheduled = true;
        queueMicrotask(() => void this.#emit({
          request: "Hello",
          info: { version: "1.0.0" }
        }));
      }
    }
    if (event === "close") {
      this.#closeListeners.push(listener as (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>);
    }
  }

  send(data: string): void {
    const request = JSON.parse(data) as { readonly id: string; readonly request: string };
    const response = request.request === "GetEvents"
      ? {
          id: request.id,
          request: request.request,
          status: "ok",
          events: {
            Twitch: [
              "Follow", "Sub", "ReSub", "Cheer", "Raid", "RewardRedemption", "GiftSub", "GiftBomb",
              "HypeTrainStart", "HypeTrainUpdate", "HypeTrainEnd",
              "PollCreated", "PollUpdated", "PollCompleted", "PollArchived", "PollTerminated",
              "PredictionCreated", "PredictionUpdated", "PredictionLocked", "PredictionCompleted", "PredictionCanceled",
              "StreamOnline", "StreamOffline"
            ]
          }
        }
      : { id: request.id, request: request.request, status: "ok" };
    queueMicrotask(() => void this.#emit(response));
  }

  close(): void {
    for (const listener of this.#closeListeners) {
      void listener({ code: 1000, reason: "closed" });
    }
  }

  async emitEvent(event: unknown): Promise<void> {
    await this.#emit(event);
  }

  async #emit(data: unknown): Promise<void> {
    for (const listener of this.#messageListeners) {
      await listener({ data });
    }
  }
}

class RecordingSpeakerBotSocket implements SpeakerBotSocket {
  readonly #listeners = {
    open: [] as (() => void | Promise<void>)[],
    message: [] as ((event: { readonly data: unknown }) => void | Promise<void>)[]
  };

  constructor(
    readonly url: string,
    private readonly requests: Record<string, unknown>[]
  ) {
    queueMicrotask(() => {
      for (const listener of this.#listeners.open) void listener();
    });
  }

  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event === "open" || event === "message") this.#listeners[event].push(listener as never);
  }

  send(data: string): void {
    const request = JSON.parse(data) as Record<string, unknown>;
    this.requests.push(request);
    queueMicrotask(() => {
      const response = JSON.stringify({ id: request.id, request: request.request, status: "ok" });
      for (const listener of this.#listeners.message) void listener({ data: response });
    });
  }

  close(): void {}
}

class ThrowingTwitchApiClient implements TwitchApiClient {
  async startDeviceAuthorization(): Promise<never> {
    throw new Error("Twitch device authorization must not run in runtime composition smoke tests");
  }

  async pollDeviceAuthorization(): Promise<never> {
    throw new Error("Twitch device authorization polling must not run in runtime composition smoke tests");
  }

  async refreshUserToken(): Promise<TwitchTokenGrant> {
    throw new Error("Twitch token refresh must not run in runtime composition smoke tests");
  }

  async validateToken(): Promise<TwitchValidatedToken> {
    throw new Error("Twitch token validation must not run in runtime composition smoke tests");
  }

  async getCurrentUser(): Promise<TwitchCurrentUser> {
    throw new Error("Twitch user lookup must not run in runtime composition smoke tests");
  }
}

class ThrowingTwitchEventSubApiClient implements TwitchEventSubApiClient {
  async createSubscription(): Promise<TwitchEventSubCreateSubscriptionResult> {
    throw new Error("Twitch EventSub API calls must not run in runtime composition smoke tests");
  }
}

function createForbiddenTwitchSocket(): TwitchEventSubSocket {
  throw new Error("Twitch EventSub sockets must not open in runtime composition smoke tests");
}

function secretKeyFromCredential(service: string, account: string): string {
  return `${service}:${account}`;
}

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for condition");
}

function isGatewayMessage(message: unknown, type: string): boolean {
  return typeof message === "object" && message !== null && "type" in message && message.type === type;
}

function followNotification(messageId: string) {
  return {
    metadata: {
      message_id: messageId,
      message_type: "notification",
      message_timestamp: "2026-07-16T12:00:00.000Z",
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
        condition: { broadcaster_user_id: "broadcaster-1" },
        transport: { method: "websocket", session_id: "session-1" },
        created_at: "2026-07-16T11:59:00.000Z"
      },
      event: {
        user_id: "viewer-1",
        user_login: "viewer",
        user_name: "Viewer",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        followed_at: "2026-07-16T12:00:00.000Z"
      }
    }
  };
}
