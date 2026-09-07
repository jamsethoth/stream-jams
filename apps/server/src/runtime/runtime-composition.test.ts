import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ActionableManagementError,
  AppConfig,
  AppConfigUpdate,
  AudioPlaybackSink,
  ConfigStore,
  DesktopAudioTransport,
  SecretRef,
  SecretStore,
  TwitchCustomRewardCatalog
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import type {
  TwitchApiClient,
  TwitchCurrentUser,
  TwitchRewardApiClient,
  TwitchTokenGrant,
  TwitchValidatedToken
} from "../modules/twitch/twitch-api-client.js";
import type {
  TwitchEventSubApiClient,
  TwitchEventSubCreateSubscriptionResult
} from "../modules/twitch/twitch-eventsub-client.js";
import * as runtimeComposition from "./runtime-composition.js";
import { createRuntimeAppComposition } from "./runtime-composition.js";

type RuntimeErrorConverter = (
  providerName: string,
  status: {
    readonly state: "error";
    readonly message: string | null;
    readonly lastErrorAt: string | null;
    readonly referenceId: string | null;
  }
) => ActionableManagementError | null;

const toEventSourceRuntimeError = (runtimeComposition as {
  readonly toEventSourceRuntimeError?: RuntimeErrorConverter;
}).toEventSourceRuntimeError;

describe("toEventSourceRuntimeError", () => {
  it("keeps the inline recovery text and gates Diagnostics by the runtime reference", () => {
    expect(toEventSourceRuntimeError).toBeTypeOf("function");

    expect(toEventSourceRuntimeError!("Main Twitch", {
      state: "error",
      message: "Twitch EventSub WebSocket error",
      lastErrorAt: "2026-07-18T12:00:00.000Z",
      referenceId: null
    })).toEqual(expect.objectContaining({
      nextStep: "Review the provider connection and reconnect it before retrying.",
      referenceId: null,
      correction: null
    }));

    expect(toEventSourceRuntimeError!("Main Twitch", {
      state: "error",
      message: "Twitch EventSub WebSocket error",
      lastErrorAt: "2026-07-18T12:00:00.000Z",
      referenceId: "ref-twitch-runtime"
    })).toEqual(expect.objectContaining({
      nextStep: "Review the provider connection and reconnect it before retrying.",
      referenceId: "ref-twitch-runtime",
      correction: {
        label: "Open diagnostics",
        route: "/manage/diagnostics?reference=ref-twitch-runtime"
      }
    }));
  });
});

describe("Twitch reward catalog runtime composition", () => {
  it("answers the protected route through an independently injected reward API client", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "stream-jams-reward-runtime-"));
    const now = createAdvancingClock();
    const oauthClient = new RuntimeTwitchOAuthClient();
    const rewardClient = new RuntimeTwitchRewardClient();
    const secretStore = new TestSecretStore();
    let composition: Awaited<ReturnType<typeof createRuntimeAppComposition>> | undefined;

    try {
      composition = await createRuntimeAppComposition({
        homeDirectory: testRoot,
        webBuildDirectory: await createWebBuildFixture(testRoot),
        configStore: new StaticConfigStore(createConfig(testRoot)),
        environment: { TWITCH_CLIENT_ID: "test-client" },
        secretStore,
        twitchApiClient: oauthClient,
        twitchRewardApiClient: rewardClient,
        twitchEventSubApiClient: new RuntimeTwitchEventSubApiClient(),
        twitchEventSubSocketFactory: () => {
          throw new Error("Twitch EventSub socket must not open in this test");
        },
        now: now.read,
        scheduleRecurring: () => ({ scheduled: true }),
        cancelRecurring: () => {}
      });
      const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
      const headers = managementAuthHeaders(session);
      const start = await composition.app.inject({ method: "POST", url: "/twitch/auth/start", headers });
      now.advance(5_000);
      const authorization = start.json() as { readonly authorizationId: string };
      const poll = await composition.app.inject({
        method: "POST",
        url: "/twitch/auth/poll",
        headers,
        payload: { authorizationId: authorization.authorizationId }
      });

      const response = await composition.app.inject({ method: "GET", url: "/twitch/custom-rewards", headers });

      expect(start.statusCode, start.body).toBe(200);
      expect(poll.statusCode, poll.body).toBe(200);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual(runtimeCatalog);
      expect(rewardClient.requests).toEqual([
        {
          accessToken: "access-token-1",
          clientId: "test-client",
          broadcasterId: "broadcaster-1"
        }
      ]);
    } finally {
      await composition?.close();
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});

it("serves audio routes over loopback, observes global mute, and retains bindings across a CLI restart", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "stream-jams-audio-runtime-"));
  let composition: Awaited<ReturnType<typeof createRuntimeAppComposition>> | undefined;
  const testOutput = vi.fn<(deviceId: string) => Promise<void>>(async () => {});
  const devicePlayback = deferred<{ readonly failedRouteIds: readonly string[] }>();
  const play = vi.fn<AudioPlaybackSink["play"]>(() => devicePlayback.promise);
  const closeAudio = vi.fn(async () => {});
  try {
    const options = {
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)), environment: {}, secretStore: new TestSecretStore(),
      scheduleRecurring: () => ({ scheduled: true }), cancelRecurring: () => {}
    };
    composition = await createRuntimeAppComposition({ ...options,
      audioPlaybackSink: { play, close: closeAudio, stop: async () => {}, setMuted: async () => {} },
      audioDeviceHost: {
      listOutputDevices: async () => [{ deviceId: "test-device", label: "Test output" }], testOutput
    } });
    const address = await composition.app.listen({ host: "127.0.0.1", port: 0 });
    expect((await fetch(`${address}/health`)).status).toBe(200);
    expect((await fetch(`${address}/audio/routes`)).status).toBe(401);
    const session = await fetch(`${address}/auth/management/sessions`, { method: "POST" });
    const sessionData = await session.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${sessionData.id}`, "x-stream-jams-csrf": sessionData.csrfToken, "content-type": "application/json" };
    const created = await fetch(`${address}/audio/routes`, { method: "POST", headers, body: JSON.stringify({ name: "Private", deviceId: "test-device" }) });
    expect(created.status).toBe(201);
    const route = await created.json() as { id: string };
    await composition.playbackCoordinator.mute();
    const muted = await fetch(`${address}/audio/routes/${route.id}/test`, { method: "POST", headers, body: "{}" });
    expect(await muted.json()).toEqual({ routeId: route.id, muted: true });
    expect(testOutput).not.toHaveBeenCalled();
    await composition.playbackCoordinator.unmute();
    const played = await fetch(`${address}/audio/routes/${route.id}/test`, { method: "POST", headers, body: "{}" });
    expect(await played.json()).toEqual({ routeId: route.id, muted: false });
    expect(testOutput).toHaveBeenCalledExactlyOnceWith("test-device");
    const createdSet = await fetch(`${address}/management/alert-sets`, {
      method: "POST", headers, body: JSON.stringify({ name: "Audio test alerts" })
    });
    expect(createdSet.status).toBe(201);
    const set = await createdSet.json() as { readonly id: string };
    const createdAlert = await fetch(`${address}/management/alert-sets/${set.id}/alerts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ eventType: "follow", name: "Audio test", themeId: "clean-signal" })
    });
    expect(createdAlert.status).toBe(201);
    const alert = await createdAlert.json() as { readonly id: string };
    const enabled = await fetch(`${address}/management/alerts/${alert.id}/enabled`, {
      method: "PATCH", headers, body: JSON.stringify({ enabled: true })
    });
    expect(enabled.status).toBe(200);
    const activated = await fetch(`${address}/management/alert-sets/${set.id}/activate`, {
      method: "POST", headers, body: JSON.stringify({ confirmWarnings: true })
    });
    expect(activated.status, await activated.text()).toBe(200);
    const editor = await fetch(`${address}/management/alerts/${alert.id}/editor`, { headers });
    expect(editor.status).toBe(200);
    const document = await editor.json() as {
      readonly layers: readonly object[];
      readonly [key: string]: unknown;
    };
    const sent = await fetch(`${address}/management/alerts/${alert.id}/editor/test`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        document: {
          ...document,
          outputs: { browserSource: false, deviceRouteIds: [route.id] },
          layers: [
            ...document.layers,
            {
              id: "sound", name: "Test tone", type: "audio", visible: true,
              order: document.layers.length, assetId: "test-tone", volume: 0.5,
              animation: {
                mode: "preset", entrance: "none", exit: "none", durationMs: 0,
                delayMs: 0, easing: "linear"
              }
            }
          ]
        },
        targetProfileId: null,
        samplePayload: { userName: "Viewer" },
        includeAudio: true,
        includeTts: true
      })
    });
    const sentBody = await sent.json() as Record<string, unknown>;
    expect(sent.status, JSON.stringify(sentBody)).toBe(200);
    expect(sentBody).toMatchObject({
      targetProfileId: null,
      referenceId: expect.stringMatching(/^ref_/u),
      test: true,
      deliveredDestinations: [{ kind: "device-route", id: route.id, name: "Private" }],
      unavailableDestinations: []
    });
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(play).toHaveBeenCalledWith(expect.objectContaining({
      documentId: alert.id, destinations: [{ deviceId: "test-device", routeIds: [route.id] }]
    }));
    expect((await fetch(`${address}/management/settings/backup-summary`, { headers }).then(response => response.json()))).toMatchObject({
      state: "blocked-live",
      blockers: [expect.objectContaining({ cause: expect.stringContaining("current playback") })]
    });
    devicePlayback.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(composition!.playbackCoordinator.getSnapshot().current).toBeNull());
    const routeTest = deferred<void>();
    testOutput.mockImplementationOnce(() => routeTest.promise);
    const testing = fetch(`${address}/audio/routes/${route.id}/test`, { method: "POST", headers, body: "{}" });
    await vi.waitFor(() => expect(testOutput).toHaveBeenCalledTimes(2));
    expect((await fetch(`${address}/management/settings/backup-summary`, { headers }).then(response => response.json()))).toMatchObject({
      state: "blocked-live",
      blockers: [expect.objectContaining({ cause: expect.stringContaining("event intake") })]
    });
    routeTest.resolve();
    expect((await testing).status).toBe(200);
    expect((await fetch(`${address}/management/settings/backup-summary`, { headers }).then(response => response.json()))).toMatchObject({
      state: "ready",
      blockers: []
    });
    await composition.close();
    expect(closeAudio).toHaveBeenCalledTimes(1);
    composition = await createRuntimeAppComposition(options);
    const restartedAddress = await composition.app.listen({ host: "127.0.0.1", port: 0 });
    const restartedSession = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const status = await fetch(`${restartedAddress}/audio/status`, { headers: managementAuthHeaders(restartedSession) });
    expect(await status.json()).toMatchObject({ capability: { available: false, reason: "desktop-unavailable" }, routes: [{
      state: "unavailable", route: { id: route.id, name: "Private", deviceId: "test-device", deviceLabel: "Test output" }
    }] });
  } finally {
    devicePlayback.resolve({ failedRouteIds: [] });
    await composition?.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});

it("applies persisted mute before wiring the desktop transport for device playback", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "stream-jams-desktop-audio-runtime-"));
  let composition: Awaited<ReturnType<typeof createRuntimeAppComposition>> | undefined;
  const calls: string[] = [];
  const transport: DesktopAudioTransport = {
    listOutputDevices: vi.fn(async () => { calls.push("devices"); return [{ deviceId: "test-device", label: "Test output" }]; }),
    testOutput: vi.fn(async () => {}),
    play: vi.fn<DesktopAudioTransport["play"]>(async () => { calls.push("play"); return { failedRouteIds: [] }; }),
    stop: vi.fn(async () => {}),
    setMuted: vi.fn(async muted => { calls.push(`mute:${String(muted)}`); }),
    retry: vi.fn(async () => { calls.push("retry"); }),
    close: vi.fn(async () => { calls.push("close"); })
  };
  try {
    const config = createConfig(testRoot);
    composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore({ ...config, playback: { ...config.playback, muted: true } }),
      environment: {},
      secretStore: new TestSecretStore(),
      scheduleRecurring: () => ({ scheduled: true }),
      cancelRecurring: () => {},
      desktopAudioTransport: transport
    });
    expect(calls).toEqual(["mute:true"]);

    await mkdir(join(testRoot, "assets", "audio"), { recursive: true });
    await writeFile(join(testRoot, "assets", "audio", "tone.mp3"), Buffer.from([1, 2, 3]));
    composition.database.connection.prepare("INSERT INTO asset_metadata VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("tone", "tone.mp3", "audio", "audio/mpeg", 3, "sha256:test", "audio/tone.mp3");
    const session = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    const headers = managementAuthHeaders(session);
    const created = await composition.app.inject({
      method: "POST",
      url: "/audio/routes",
      headers,
      payload: { name: "Private", deviceId: "test-device" }
    });
    expect(created.statusCode, created.body).toBe(201);
    const route = created.json() as { id: string };

    composition.playbackCoordinator.enqueueResolvedTest({
      sourceEvent: {
        id: "device-only-event", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch",
        occurredAt: "2026-09-07T00:00:00.000Z", type: "cheer", amount: 100,
        actor: { id: "viewer", displayName: "Viewer" }, message: null, metadata: {}
      },
      alerts: [],
      audio: [{
        documentId: "document", durationMs: 3_000,
        outputs: { browserSource: false, deviceRouteIds: [route.id] },
        layers: [{ layerId: "sound", assetId: "tone", volume: 0.5 }]
      }]
    });

    await vi.waitFor(() => expect(transport.play).toHaveBeenCalledTimes(1));
    expect(transport.play).toHaveBeenCalledWith(expect.objectContaining({
      batch: expect.objectContaining({ playbackId: expect.any(String), muted: true }),
      assets: [{ assetId: "tone", mimeType: "audio/mpeg", bytes: new Uint8Array([1, 2, 3]) }],
      deadlineMs: expect.any(Number),
      startDeadlineMs: expect.any(Number)
    }));
    expect(calls).toEqual(["mute:true", "devices", "devices", "play"]);
    expect((await composition.app.inject({ method: "POST", url: "/audio/retry", headers })).statusCode).toBe(204);
    expect(transport.retry).toHaveBeenCalledTimes(1);
  } finally {
    await composition?.close();
    await rm(testRoot, { recursive: true, force: true });
  }
  expect(transport.close).toHaveBeenCalledTimes(1);
});

const runtimeCatalog: TwitchCustomRewardCatalog = {
  rewards: [
    {
      id: "reward-runtime",
      title: "Hydrate",
      prompt: "Drink water",
      cost: 500,
      backgroundColor: "#00AAFF",
      isUserInputRequired: false,
      isEnabled: true,
      isPaused: false,
      isInStock: true
    }
  ]
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

class RuntimeTwitchOAuthClient implements TwitchApiClient {
  async startDeviceAuthorization() {
    return {
      deviceCode: "device-code-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresIn: 600,
      interval: 5
    };
  }

  async pollDeviceAuthorization() {
    return {
      status: "granted" as const,
      grant: {
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        expiresIn: 14_400,
        scopes: ["channel:read:redemptions"],
        tokenType: "bearer" as const
      }
    };
  }

  async refreshUserToken(): Promise<TwitchTokenGrant> {
    throw new Error("refresh should not be called");
  }

  async validateToken(): Promise<TwitchValidatedToken> {
    return {
      clientId: "test-client",
      login: "streamer",
      scopes: ["channel:read:redemptions"],
      userId: "broadcaster-1",
      expiresIn: 14_000
    };
  }

  async getCurrentUser(): Promise<TwitchCurrentUser> {
    return {
      id: "broadcaster-1",
      login: "streamer",
      displayName: "Streamer"
    };
  }
}

class RuntimeTwitchRewardClient implements TwitchRewardApiClient {
  readonly requests: Parameters<TwitchRewardApiClient["getCustomRewards"]>[0][] = [];

  async getCustomRewards(input: Parameters<TwitchRewardApiClient["getCustomRewards"]>[0]) {
    this.requests.push(input);
    return runtimeCatalog;
  }
}

class RuntimeTwitchEventSubApiClient implements TwitchEventSubApiClient {
  async createSubscription(): Promise<TwitchEventSubCreateSubscriptionResult> {
    throw new Error("EventSub subscriptions must not be created in this test");
  }
}

class StaticConfigStore implements ConfigStore {
  constructor(private config: AppConfig) {}

  async readConfig(): Promise<AppConfig> {
    return this.config;
  }

  async updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    this.config = {
      desktop: { ...this.config.desktop, ...patch.desktop },
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

class TestSecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.values.set(secretRefKey(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.values.get(secretRefKey(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.values.delete(secretRefKey(ref));
  }
}

function secretRefKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}

async function createWebBuildFixture(testRoot: string): Promise<string> {
  const webBuildDirectory = join(testRoot, "web-dist");
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await writeFile(join(webBuildDirectory, "assets", "index.js"), "", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "index.css"), "", "utf8");
  await writeFile(
    join(webBuildDirectory, ".vite", "manifest.json"),
    JSON.stringify({ "index.html": { file: "assets/index.js", isEntry: true, css: ["assets/index.css"] } }),
    "utf8"
  );
  return webBuildDirectory;
}

function createConfig(testRoot: string): AppConfig {
  return {
    desktop: { closeToTray: true },
    server: { host: "127.0.0.1", port: 39_187 },
    storage: { dataDirectory: join(testRoot, "data"), assetDirectory: join(testRoot, "assets") },
    logging: { level: "INFO", rollover: "hourly", retentionHours: 48 },
    playback: { paused: false, muted: false, doNotDisturb: false }
  };
}

function managementAuthHeaders(response: { json(): unknown }): {
  readonly authorization: string;
  readonly "x-stream-jams-csrf": string;
} {
  const session = response.json() as { readonly id: string; readonly csrfToken: string };
  return {
    authorization: `Bearer ${session.id}`,
    "x-stream-jams-csrf": session.csrfToken
  };
}

function createAdvancingClock() {
  let nowMs = Date.parse("2026-08-27T12:00:00.000Z");
  return {
    advance(milliseconds: number) {
      nowMs += milliseconds;
    },
    read: () => new Date(nowMs)
  };
}
