import type { NormalizedStreamEvent, SecretRef, StreamerBotSubscriptionSelection } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import type { ProviderRegistrationRecord } from "../providers/sqlite-provider-registration-repository.js";
import type {
  StreamerBotClientStatus,
  StreamerBotConnectionInput,
  StreamerBotEventEnvelope
} from "./streamerbot-client.js";
import {
  StreamerBotRuntimeService,
  type StreamerBotRuntimeClient,
  type StreamerBotRuntimeDiagnostic
} from "./streamerbot-runtime-service.js";

describe("StreamerBotRuntimeService", () => {
  it("connects the active registration, resolves its secret, and preserves the discovered category key", async () => {
    const client = new FakeClient({
      tWiTcH: [...supportedEvents, "ChatMessage"]
    });
    const secretReads: SecretRef[] = [];
    const service = runtime({
      client,
      active: registration({ secretRef: { namespace: "streamerbot", accountId: "provider-streamerbot", name: "password" } }),
      async getSecret(ref) {
        secretReads.push(ref);
        return "secret-password";
      }
    });

    await service.syncActiveRegistration();

    expect(secretReads).toEqual([{ namespace: "streamerbot", accountId: "provider-streamerbot", name: "password" }]);
    expect(client.connectInputs).toEqual([{
      protocol: "ws",
      host: "127.0.0.1",
      port: 8080,
      endpoint: "/",
      password: "secret-password"
    }]);
    expect(client.subscriptions).toEqual([{
      sourceKey: "tWiTcH",
      eventTypes: supportedEvents
    }]);
    expect(service.getStatus()).toMatchObject({
      state: "connected",
      activeProviderId: "provider-streamerbot",
      subscribedEventTypes: supportedEvents,
      missingEventTypes: [],
      message: null
    });
  });

  it("subscribes to available supported events and reports missing types as degraded", async () => {
    const client = new FakeClient({ twitch: ["Follow", "GiftSub", "PollCompleted"] });
    const service = runtime({ client, active: registration() });

    await service.syncActiveRegistration();

    expect(client.subscriptions).toEqual([{
      sourceKey: "twitch",
      eventTypes: ["Follow", "GiftSub", "PollCompleted"]
    }]);
    expect(service.getStatus()).toMatchObject({
      state: "degraded",
      subscribedEventTypes: ["Follow", "GiftSub", "PollCompleted"],
      missingEventTypes: supportedEvents.filter((eventType) => !["Follow", "GiftSub", "PollCompleted"].includes(eventType)),
      message: `Streamer.bot is missing supported Twitch events: ${supportedEvents.filter((eventType) => !["Follow", "GiftSub", "PollCompleted"].includes(eventType)).join(", ")}`
    });
  });

  it("resubscribes the expanded discovered catalog after a reconnect", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    const service = runtime({ client, active: registration() });

    await service.syncActiveRegistration();
    client.setStatus(status("idle"));
    await service.syncActiveRegistration();

    expect(client.subscriptions).toEqual([
      { sourceKey: "Twitch", eventTypes: supportedEvents },
      { sourceKey: "Twitch", eventTypes: supportedEvents }
    ]);
    expect(client.subscriptions.flatMap((selection) => selection.eventTypes)).not.toContain("HypeTrainLevelUp");
  });

  it("normalizes supported events and records unsupported events without forwarding raw payloads", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    const ingested: NormalizedStreamEvent[] = [];
    const diagnostics: StreamerBotRuntimeDiagnostic[] = [];
    const service = runtime({
      client,
      active: registration(),
      async ingestNormalizedEvent(event) {
        ingested.push(event);
        return { status: "accepted", event };
      },
      onDiagnostic(entry) {
        diagnostics.push(entry);
      }
    });
    await service.syncActiveRegistration();

    await client.emit({
      timeStamp: "2026-07-17T12:04:00.000Z",
      event: { source: "Twitch", type: "Raid" },
      data: {
        user: { id: "user-raid", login: "raider", name: "Raider" },
        viewers: 42,
        createdAt: "2026-07-17T12:04:00.000Z"
      }
    });
    await client.emit({
      timeStamp: "2026-07-17T12:05:00.000Z",
      event: { source: "OBS", type: "SceneChanged" },
      data: { sceneName: "Live", password: "must-not-be-logged" }
    });

    expect(ingested).toHaveLength(1);
    expect(ingested[0]).toMatchObject({ type: "raid", ingestProvider: "streamerbot", amount: 42 });
    expect(diagnostics).toContainEqual({
      level: "info",
      message: "Unsupported Streamer.bot event was ignored",
      referenceId: "ref-1",
      source: "OBS",
      type: "SceneChanged"
    });
    expect(JSON.stringify(diagnostics)).not.toContain("must-not-be-logged");
  });

  it("reports malformed supported payloads with a reference ID while keeping the callback safe", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    const diagnostics: StreamerBotRuntimeDiagnostic[] = [];
    const service = runtime({
      client,
      active: registration(),
      onDiagnostic(entry) {
        diagnostics.push(entry);
      }
    });
    await service.syncActiveRegistration();

    await expect(client.emit({
      timeStamp: "2026-07-17T12:04:00.000Z",
      event: { source: "Twitch", type: "Raid" },
      data: { viewers: 42 }
    })).resolves.toBeUndefined();

    expect(service.getStatus()).toMatchObject({
      state: "degraded",
      message: "Streamer.bot Twitch.Raid payload was invalid",
      referenceId: "ref-1"
    });
    expect(diagnostics).toEqual([{
      level: "error",
      message: "Streamer.bot Twitch.Raid payload was invalid",
      referenceId: "ref-1",
      source: "Twitch",
      type: "Raid"
    }]);
  });

  it("adopts an ingestion failure reference without emitting a duplicate diagnostic", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    const diagnostics: StreamerBotRuntimeDiagnostic[] = [];
    const service = runtime({
      client,
      active: registration(),
      ingestNormalizedEvent: async () => ({
        status: "rejected",
        message: "Normalized stream event ingestion failed",
        referenceId: "ref-ingestion-1"
      }),
      onDiagnostic(entry) {
        diagnostics.push(entry);
      }
    });
    await service.syncActiveRegistration();

    await client.emit({
      timeStamp: "2026-07-17T12:04:00.000Z",
      event: { source: "Twitch", type: "Raid" },
      data: {
        user: { id: "user-raid", login: "raider", name: "Raider" },
        viewers: 42,
        createdAt: "2026-07-17T12:04:00.000Z"
      }
    });

    expect(service.getStatus()).toMatchObject({
      state: "degraded",
      message: "Normalized stream event ingestion failed",
      referenceId: "ref-ingestion-1"
    });
    expect(diagnostics).toEqual([]);
  });

  it("clears an ingestion issue after a later event is accepted", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    let reject = true;
    const service = runtime({
      client,
      active: registration(),
      ingestNormalizedEvent: async (event) => reject
        ? { status: "rejected", message: "Normalized stream event ingestion failed", referenceId: "ref-ingestion-1" }
        : { status: "accepted", event }
    });
    await service.syncActiveRegistration();

    await client.emit(validRaidEnvelope());
    expect(service.getStatus()).toMatchObject({ state: "degraded", referenceId: "ref-ingestion-1" });

    reject = false;
    await client.emit(validRaidEnvelope());

    expect(service.getStatus()).toMatchObject({ state: "connected", message: null, referenceId: null });
  });

  it("fails safely when a configured password cannot be loaded", async () => {
    const client = new FakeClient({ Twitch: ["Raid"] });
    const service = runtime({
      client,
      active: registration({ secretRef: { namespace: "streamerbot", accountId: "provider-streamerbot", name: "password" } }),
      getSecret: async () => null
    });

    await service.syncActiveRegistration();

    expect(client.connectInputs).toEqual([]);
    expect(service.getStatus()).toMatchObject({
      state: "error",
      message: "Streamer.bot password is unavailable",
      referenceId: "ref-1"
    });
  });

  it("disconnects when Streamer.bot is not the active event source", async () => {
    const client = new FakeClient({ Twitch: ["Raid"] });
    const service = runtime({ client, active: registration() });
    await service.syncActiveRegistration();

    service.setActive(registration({ kind: "twitch" }));
    await service.syncActiveRegistration();

    expect(client.disconnectCount).toBe(1);
    expect(service.getStatus()).toMatchObject({ state: "idle", activeProviderId: null });
  });

  it("propagates the client's transport failure reference", async () => {
    const client = new FakeClient({ Twitch: supportedEvents });
    const service = runtime({ client, active: registration() });
    await service.syncActiveRegistration();

    client.setStatus({
      ...status("error"),
      message: "Streamer.bot WebSocket error",
      lastErrorAt: "2026-07-17T12:05:00.000Z",
      referenceId: "ref-client-transport"
    });

    expect(service.getStatus()).toMatchObject({
      state: "error",
      message: "Streamer.bot WebSocket error",
      lastErrorAt: "2026-07-17T12:05:00.000Z",
      referenceId: "ref-client-transport"
    });
  });
});

class FakeClient implements StreamerBotRuntimeClient {
  readonly connectInputs: StreamerBotConnectionInput[] = [];
  readonly subscriptions: StreamerBotSubscriptionSelection[] = [];
  disconnectCount = 0;
  #status = status("idle");
  #onEvent: (envelope: StreamerBotEventEnvelope) => void | Promise<void> = () => {};

  constructor(readonly events: Record<string, readonly string[]>) {}

  setEventHandler(onEvent: (envelope: StreamerBotEventEnvelope) => void | Promise<void>) {
    this.#onEvent = onEvent;
  }

  setStatus(next: StreamerBotClientStatus): void {
    this.#status = next;
  }

  connect(input: StreamerBotConnectionInput): void {
    this.connectInputs.push(input);
    this.#status = status("connected");
  }

  disconnect(): void {
    this.disconnectCount += 1;
    this.#status = status("idle");
  }

  getStatus(): StreamerBotClientStatus {
    return this.#status;
  }

  async getEvents(): Promise<Record<string, readonly string[]>> {
    return this.events;
  }

  async subscribe(selections: readonly StreamerBotSubscriptionSelection[]): Promise<void> {
    this.subscriptions.push(...selections);
  }

  async emit(envelope: StreamerBotEventEnvelope): Promise<void> {
    await this.#onEvent(envelope);
  }
}

function runtime(options: {
  readonly client: FakeClient;
  readonly active: ProviderRegistrationRecord | null;
  readonly getSecret?: (ref: SecretRef) => Promise<string | null>;
  readonly ingestNormalizedEvent?: (event: NormalizedStreamEvent) => Promise<
    | { readonly status: "accepted"; readonly event: NormalizedStreamEvent }
    | { readonly status: "duplicate"; readonly messageId: string }
    | { readonly status: "rejected"; readonly message: string; readonly referenceId: string }
  >;
  readonly onDiagnostic?: (entry: StreamerBotRuntimeDiagnostic) => void | Promise<void>;
}) {
  let active = options.active;
  let reference = 0;
  const service = new StreamerBotRuntimeService({
    repository: { findActive: async () => active },
    secretStore: { getSecret: options.getSecret ?? (async () => null) },
    createClient(onEvent) {
      options.client.setEventHandler(onEvent);
      return options.client;
    },
    ingestionService: {
      ingestNormalizedEvent: options.ingestNormalizedEvent ?? (async (event) => ({ status: "accepted", event }))
    },
    generateReferenceId: () => `ref-${++reference}`,
    onDiagnostic: options.onDiagnostic,
    now: () => new Date("2026-07-17T12:00:00.000Z"),
    sleep: async () => {},
    connectionTimeoutMs: 100,
    pollIntervalMs: 10
  });
  return Object.assign(service, {
    setActive(next: ProviderRegistrationRecord | null) {
      active = next;
    }
  });
}

function registration(options: {
  readonly kind?: "streamerbot" | "twitch";
  readonly secretRef?: SecretRef | null;
} = {}): ProviderRegistrationRecord {
  const kind = options.kind ?? "streamerbot";
  return {
    provider: {
      id: kind === "streamerbot" ? "provider-streamerbot" : "provider-twitch",
      name: kind === "streamerbot" ? "Studio Streamer.bot" : "Main Twitch",
      kind,
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      validatedAt: "2026-07-17T11:00:00.000Z",
      error: null,
      usedByAlertCount: 1
    },
    configuration: kind === "streamerbot"
      ? { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
      : {},
    availableVoices: [],
    secretRef: options.secretRef ?? null,
    ttsSafety: null,
    createdAt: "2026-07-17T11:00:00.000Z",
    updatedAt: "2026-07-17T11:00:00.000Z"
  };
}

function status(state: StreamerBotClientStatus["state"]): StreamerBotClientStatus {
  return {
    state,
    url: state === "idle" ? null : "ws://127.0.0.1:8080/",
    message: null,
    connectedAt: state === "connected" ? "2026-07-17T12:00:00.000Z" : null,
    lastMessageAt: state === "connected" ? "2026-07-17T12:00:00.000Z" : null,
    lastErrorAt: null,
    instance: state === "connected" ? { version: "1.0" } : null,
    subscriptionSourceKeys: [],
    pendingRequestCount: 0,
    referenceId: null
  };
}

const supportedEvents = [
  "Follow", "Sub", "ReSub", "Cheer", "Raid", "RewardRedemption",
  "GiftSub", "GiftBomb",
  "HypeTrainStart", "HypeTrainUpdate", "HypeTrainEnd",
  "PollCreated", "PollUpdated", "PollCompleted", "PollArchived", "PollTerminated",
  "PredictionCreated", "PredictionUpdated", "PredictionLocked", "PredictionCompleted", "PredictionCanceled",
  "StreamOnline", "StreamOffline"
] as const;

function validRaidEnvelope(): StreamerBotEventEnvelope {
  return {
    timeStamp: "2026-07-17T12:04:00.000Z",
    event: { source: "Twitch", type: "Raid" },
    data: {
      user: { id: "user-raid", login: "raider", name: "Raider" },
      viewers: 42,
      createdAt: "2026-07-17T12:04:00.000Z"
    }
  };
}
