import { InMemorySecretStore } from "@stream-jams/test-support";
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
      subscriptionTypes: ["channel.follow"],
      referenceId: null
    });
    let validationCount = 0;
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
        message: null,
        referenceId: null
      }),
      secretStore,
      async validateConnectedAccount() {
        validationCount += 1;
      }
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
          scopes: [
            "bits:read",
            "channel:read:hype_train",
            "channel:read:polls",
            "channel:read:predictions",
            "channel:read:redemptions",
            "channel:read:subscriptions",
            "moderator:read:followers"
          ]
        }
      }
    ]);
    expect(validationCount).toBe(1);
  });

  it("reports an actionable authorization failure before opening EventSub", async () => {
    const eventSubClient = new RecordingEventSubClient();
    const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(connectedAccount),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      generateReferenceId: () => "ref-twitch-auth",
      onDiagnostic(entry) {
        diagnostics.push(entry);
      },
      secretStore: new InMemorySecretStore(),
      async validateConnectedAccount() {
        throw new Error("expired access token");
      }
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "error",
      connectionState: "idle",
      message: "Twitch authorization could not be validated or refreshed",
      referenceId: "ref-twitch-auth"
    });
    expect(eventSubClient.connectInputs).toEqual([]);
    expect(eventSubClient.disconnectCount).toBe(1);
    expect(diagnostics).toEqual([{
      message: "Twitch authorization could not be validated or refreshed",
      referenceId: "ref-twitch-auth"
    }]);
  });

  it("blocks EventSub and records a reference-linked error when the saved grant is missing required scopes", async () => {
    const secretStore = new InMemorySecretStore();
    const eventSubClient = new RecordingEventSubClient();
    const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
    await secretStore.setSecret(createTwitchTokenSecretRef("141981764", "access_token"), "access-token-1");
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository({ ...connectedAccount, scopes: ["bits:read"] }),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      generateReferenceId: () => "ref-twitch-scopes",
      onDiagnostic(entry) {
        diagnostics.push(entry);
      },
      secretStore
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "error",
      message: "Twitch authorization update required. Reconnect Twitch to grant the added event permissions.",
      referenceId: "ref-twitch-scopes"
    });
    expect(eventSubClient.connectInputs).toEqual([]);
    expect(diagnostics).toEqual([{
      message: "Twitch authorization update required. Reconnect Twitch to grant the added event permissions.",
      referenceId: "ref-twitch-scopes"
    }]);
  });

  it("reports an actionable failure when the active Twitch source has no connected account", async () => {
    const eventSubClient = new RecordingEventSubClient();
    const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(null),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      generateReferenceId: () => "ref-missing-account",
      onDiagnostic(entry) {
        diagnostics.push(entry);
      },
      secretStore: new InMemorySecretStore()
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "error",
      connectionState: "idle",
      message: "Twitch account connection is unavailable",
      referenceId: "ref-missing-account"
    });
    expect(eventSubClient.disconnectCount).toBe(1);
    expect(diagnostics).toEqual([{
      message: "Twitch account connection is unavailable",
      referenceId: "ref-missing-account"
    }]);
  });

  it("does not inherit another provider's ingestion failure while Twitch is idle", () => {
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(null),
      clientId: "client-id",
      eventSubClient: new RecordingEventSubClient(),
      ingestionService: new StaticIngestionStatusService({
        state: "degraded",
        acceptedCount: 0,
        duplicateCount: 0,
        rejectedCount: 1,
        lastEventAt: null,
        lastErrorAt: "2026-05-31T13:00:00.000Z",
        message: "Streamer.bot event ingestion failed",
        referenceId: "ref-streamerbot-ingestion"
      }),
      secretStore: new InMemorySecretStore()
    });

    expect(service.getStatus()).toMatchObject({
      state: "idle",
      connectionState: "idle",
      lastErrorAt: null,
      message: null,
      referenceId: null
    });
  });

  it("reports connection startup failures without exposing token values", async () => {
    const secretStore = new InMemorySecretStore();
    await secretStore.setSecret(createTwitchTokenSecretRef("141981764", "access_token"), "access-token-secret");
    const eventSubClient = new RecordingEventSubClient(undefined, new Error("access-token-secret leaked by runtime"));
    const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
    const service = new TwitchEventSubRuntimeService({
      accountRepository: new InMemoryTwitchAccountRepository(connectedAccount),
      clientId: "client-id",
      eventSubClient,
      ingestionService: new StaticIngestionStatusService(),
      generateReferenceId: () => "ref-twitch-runtime-1",
      onDiagnostic(entry) {
        diagnostics.push(entry);
      },
      now: () => new Date("2026-05-31T13:00:00.000Z"),
      secretStore
    });

    await expect(service.connectStoredAccount()).resolves.toMatchObject({
      state: "error",
      connectionState: "idle",
      lastErrorAt: "2026-05-31T13:00:00.000Z",
      message: "Twitch EventSub WebSocket could not be started",
      referenceId: "ref-twitch-runtime-1"
    });
    service.getStatus();
    service.getStatus();
    expect(diagnostics).toEqual([{
      message: "Twitch EventSub WebSocket could not be started",
      referenceId: "ref-twitch-runtime-1"
    }]);
    expect(JSON.stringify(service.getStatus())).not.toContain("access-token-secret");
  });
});

const connectedAccount: TwitchAccount = {
  accountId: "141981764",
  login: "streamer",
  displayName: "Streamer",
  scopes: [
    "bits:read",
    "channel:read:hype_train",
    "channel:read:polls",
    "channel:read:predictions",
    "channel:read:redemptions",
    "channel:read:subscriptions",
    "moderator:read:followers"
  ],
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
        subscriptionTypes: [],
        referenceId: null
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
      subscriptionTypes: [],
      referenceId: null
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

const idleIngestionStatus: EventIngestionStatus = {
  state: "idle",
  acceptedCount: 0,
  duplicateCount: 0,
  rejectedCount: 0,
  lastEventAt: null,
  lastErrorAt: null,
  message: null,
  referenceId: null
};
