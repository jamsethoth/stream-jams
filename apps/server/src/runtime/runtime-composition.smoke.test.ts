import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig, AppConfigUpdate, ConfigStore, SecretRef, SecretStore } from "@stream-jams/core";
import { afterEach, describe, expect, it } from "vitest";
import type { TwitchApiClient, TwitchCurrentUser, TwitchTokenGrant, TwitchValidatedToken } from "../modules/twitch/twitch-api-client.js";
import type {
  TwitchEventSubApiClient,
  TwitchEventSubCreateSubscriptionResult,
  TwitchEventSubSocket
} from "../modules/twitch/twitch-eventsub-client.js";
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
      secretStore: new LocalSecretStore(),
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
    const authorization = `Bearer ${(session.json() as { readonly id: string }).id}`;
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
      headers: { authorization }
    });
    const playback = await app.inject({
      method: "GET",
      url: "/playback",
      headers: { authorization }
    });
    const overlayModules = await app.inject({
      method: "GET",
      url: "/overlay-modules",
      headers: { authorization }
    });
    const overlayModuleConfig = await app.inject({
      method: "GET",
      url: "/overlay-modules/alerts/config",
      headers: { authorization }
    });
    const twitchStatus = await app.inject({
      method: "GET",
      url: "/twitch/eventsub/status",
      headers: { authorization }
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

function createSequence(prefix: string): () => string {
  let value = 0;
  return () => {
    value += 1;
    return `${prefix}-${value}`;
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

class LocalSecretStore implements SecretStore {
  readonly #secrets = new Map<string, string>();

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.#secrets.set(secretKey(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.#secrets.get(secretKey(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.#secrets.delete(secretKey(ref));
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

function secretKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}
