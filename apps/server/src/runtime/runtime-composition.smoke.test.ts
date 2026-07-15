import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig, AppConfigUpdate, ConfigStore } from "@stream-jams/core";
import { createSequence, InMemorySecretStore } from "@stream-jams/test-support";
import { afterEach, describe, expect, it } from "vitest";
import type { TwitchApiClient, TwitchCurrentUser, TwitchTokenGrant, TwitchValidatedToken } from "../modules/twitch/twitch-api-client.js";
import type {
  TwitchEventSubApiClient,
  TwitchEventSubCreateSubscriptionInput,
  TwitchEventSubCreateSubscriptionResult,
  TwitchEventSubSocket
} from "../modules/twitch/twitch-eventsub-client.js";
import type { OsCredentialAdapter } from "../modules/security/os-secret-store.js";
import { runtimeSecretStoreUnavailableMessage } from "../modules/security/runtime-secret-store.js";
import { createRuntimeAppComposition, type RuntimeAppComposition } from "./runtime-composition.js";

const temporaryDirectories: string[] = [];
const runtimeCompositions: RuntimeAppComposition[] = [];

afterEach(async () => {
  await Promise.all(runtimeCompositions.splice(0).map((composition) => composition.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runtime app composition smoke", () => {
  it("serves local runtime surfaces and representative adapters from one composition factory", async () => {
    const testRoot = await createTemporaryDirectory();
    const webBuildDirectory = await createWebBuildFixture(testRoot);
    const composition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory,
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
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
      activeAlertSet: null,
      actionableProblems: [],
      readiness: expect.arrayContaining([
        expect.objectContaining({ id: "event-source", state: "action-required" }),
        expect.objectContaining({ id: "tts-provider", state: "action-required" })
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

  it("persists overlay module config across runtime restart", async () => {
    const testRoot = await createTemporaryDirectory();
    const firstComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
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
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
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
        environment: {
          NODE_ENV: nodeEnv,
          TWITCH_CLIENT_ID: "test-client",
          TWITCH_CLIENT_SECRET: "test-secret"
        },
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
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
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
    const start = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders,
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });

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
        message: runtimeSecretStoreUnavailableMessage
      }
    });
  });

  it("persists Twitch token references across runtime restart without exposing token material in diagnostics", async () => {
    const testRoot = await createTemporaryDirectory();
    const credentials = new RecordingCredentialAdapter();
    const firstComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: credentials,
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
      twitchApiClient: new RecordingTwitchApiClient(),
      twitchEventSubApiClient: new RecordingTwitchEventSubApiClient(),
      twitchEventSubSocketFactory: createForbiddenTwitchSocket,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      generateManagementSessionId: () => "mgmt_restart-secret-store"
    });
    runtimeCompositions.push(firstComposition);

    const firstApp = firstComposition.app;
    const session = await firstApp.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });
    const authHeaders = managementAuthHeaders(session);
    const start = await firstApp.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders,
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });
    const callback = await firstApp.inject({
      method: "GET",
      url: `/twitch/auth/callback?code=oauth-code&state=${encodeURIComponent((start.json() as { readonly state: string }).state)}`
    });
    const diagnosticsExport = await firstApp.inject({
      method: "GET",
      url: "/diagnostics/export?limit=5",
      headers: authHeaders
    });

    expect(callback.statusCode).toBe(200);
    expect(credentials.values.get("stream-jams:twitch:access_token:141981764")).toBe("access-token-1");
    expect(credentials.values.get("stream-jams:twitch:refresh_token:141981764")).toBe("refresh-token-1");
    expect(JSON.stringify(diagnosticsExport.json())).not.toContain("access-token-1");
    expect(JSON.stringify(diagnosticsExport.json())).not.toContain("refresh-token-1");

    await firstComposition.close();
    runtimeCompositions.splice(runtimeCompositions.indexOf(firstComposition), 1);

    const eventSubApiClient = new RecordingTwitchEventSubApiClient();
    const sockets: ControlledTwitchSocket[] = [];
    const secondComposition = await createRuntimeAppComposition({
      homeDirectory: testRoot,
      webBuildDirectory: await createWebBuildFixture(testRoot),
      configStore: new StaticConfigStore(createConfig(testRoot)),
      credentialAdapter: credentials,
      environment: {
        TWITCH_CLIENT_ID: "test-client",
        TWITCH_CLIENT_SECRET: "test-secret"
      },
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

function createConfig(testRoot: string): AppConfig {
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
    }
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
  async exchangeAuthorizationCode(): Promise<TwitchTokenGrant> {
    return {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      expiresIn: 14_400,
      scopes: ["bits:read", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"],
      tokenType: "bearer"
    };
  }

  async refreshUserToken(): Promise<TwitchTokenGrant> {
    throw new Error("Twitch token refresh must not run in runtime composition smoke tests");
  }

  async validateToken(): Promise<TwitchValidatedToken> {
    return {
      clientId: "test-client",
      login: "streamer",
      scopes: ["bits:read", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"],
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

  async createSubscription(input: TwitchEventSubCreateSubscriptionInput): Promise<TwitchEventSubCreateSubscriptionResult> {
    this.requests.push(input);
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

  close(): void {
    for (const listener of this.#closeListeners) {
      listener({ code: 1000, reason: "closed" });
    }
  }
}

class ThrowingTwitchApiClient implements TwitchApiClient {
  async exchangeAuthorizationCode(): Promise<TwitchTokenGrant> {
    throw new Error("Twitch OAuth exchange must not run in runtime composition smoke tests");
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

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for condition");
}
