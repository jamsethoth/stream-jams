import type { SecretRef, SecretStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import type { EventIngestionStatus } from "../events/event-ingestion-service.js";
import type { TwitchAccount, TwitchAccountRepository } from "./twitch-account-repository.js";
import { createTwitchTokenSecretRef } from "./twitch-oauth-service.js";
import type { TwitchEventSubConnectionInput, TwitchEventSubStatus } from "./twitch-eventsub-client.js";
import { TwitchEventSubRuntimeService } from "./twitch-eventsub-runtime-service.js";

describe("TwitchEventSubRuntimeService", () => {
  it("connects the stored broadcaster with the access token and reports connection plus ingestion status", async () => {
    const repository = new InMemoryTwitchAccountRepository(connectedAccount);
    const secretStore = new InMemorySecretStore();
    await secretStore.setSecret(createTwitchTokenSecretRef("141981764", "access_token"), "access-token-1");
    const eventSubClient = new RecordingEventSubClient({
      state: "connected",
      sessionId: "session-1",
      message: null,
      connectedAt: "2026-05-31T12:00:00.000Z",
      lastMessageAt: "2026-05-31T12:00:01.000Z",
      lastErrorAt: null,
      subscriptionTypes: ["channel.follow"]
    });
    const service = new TwitchEventSubRuntimeService({
      accountRepository: repository,
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService({
        state: "ready",
        acceptedCount: 3,
        duplicateCount: 1,
        rejectedCount: 0,
        lastEventAt: "2026-05-31T12:00:02.000Z",
        lastErrorAt: null,
        message: null
      }),
      secretStore
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "connected",
      connectionState: "connected",
      sessionId: "session-1",
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      subscriptionTypes: ["channel.follow"]
    });
    expect(eventSubClient.connectInputs).toEqual([
      {
        accessToken: "access-token-1",
        clientId: "client-id",
        account: {
          accountId: "141981764",
          scopes: ["bits:read"]
        }
      }
    ]);
  });

  it("disconnects the EventSub client when no connected account is stored", async () => {
    const eventSubClient = new RecordingEventSubClient();
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(null),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      secretStore: new InMemorySecretStore()
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "idle",
      connectionState: "idle",
      message: null
    });
    expect(eventSubClient.disconnectCount).toBe(1);
  });

  it("reports connection startup failures without exposing token values", async () => {
    const secretStore = new InMemorySecretStore();
    await secretStore.setSecret(createTwitchTokenSecretRef("141981764", "access_token"), "access-token-secret");
    const eventSubClient = new RecordingEventSubClient(undefined, new Error("access-token-secret leaked by runtime"));
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(connectedAccount),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      now: () => new Date("2026-05-31T13:00:00.000Z"),
      secretStore
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "error",
      connectionState: "idle",
      lastErrorAt: "2026-05-31T13:00:00.000Z",
      message: "Twitch EventSub WebSocket could not be started"
    });
    expect(JSON.stringify(service.getStatus())).not.toContain("access-token-secret");
  });
});

const connectedAccount: TwitchAccount = {
  accountId: "141981764",
  login: "streamer",
  displayName: "Streamer",
  scopes: ["bits:read"],
  connectedAt: "2026-05-31T11:00:00.000Z",
  updatedAt: "2026-05-31T11:00:00.000Z"
};

class RecordingEventSubClient {
  readonly connectInputs: TwitchEventSubConnectionInput[] = [];
  disconnectCount = 0;
  #status: TwitchEventSubStatus;

  constructor(status?: TwitchEventSubStatus, private readonly connectError?: Error) {
    this.#status =
      status ?? {
        state: "idle",
        sessionId: null,
        message: null,
        connectedAt: null,
        lastMessageAt: null,
        lastErrorAt: null,
        subscriptionTypes: []
      };
  }

  connect(input: TwitchEventSubConnectionInput): void {
    if (this.connectError !== undefined) {
      throw this.connectError;
    }

    this.connectInputs.push(input);
  }

  disconnect(): void {
    this.disconnectCount += 1;
    this.#status = {
      state: "idle",
      sessionId: null,
      message: null,
      connectedAt: null,
      lastMessageAt: null,
      lastErrorAt: null,
      subscriptionTypes: []
    };
  }

  getStatus(): TwitchEventSubStatus {
    return this.#status;
  }
}

class StaticIngestionStatusService {
  constructor(private readonly status: EventIngestionStatus = idleIngestionStatus) {}

  getStatus(): EventIngestionStatus {
    return this.status;
  }
}

class InMemoryTwitchAccountRepository implements Pick<TwitchAccountRepository, "findConnectedAccount"> {
  constructor(private readonly account: TwitchAccount | null) {}

  async findConnectedAccount(): Promise<TwitchAccount | null> {
    return this.account;
  }
}

class InMemorySecretStore implements SecretStore {
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

const idleIngestionStatus: EventIngestionStatus = {
  state: "idle",
  acceptedCount: 0,
  duplicateCount: 0,
  rejectedCount: 0,
  lastEventAt: null,
  lastErrorAt: null,
  message: null
};

function secretKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}
