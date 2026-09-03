import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ActionableManagementError,
  AppConfig,
  AppConfigUpdate,
  ConfigStore,
  SecretRef,
  SecretStore,
  TwitchCustomRewardCatalog
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
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
