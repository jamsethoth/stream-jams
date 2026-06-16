import type { SecretStore } from "@stream-jams/core";
import type { EventIngestionStatus } from "../events/event-ingestion-service.js";
import { runtimeSecretStoreUnavailableMessage } from "../security/runtime-secret-store.js";
import type { TwitchAccountRepository } from "./twitch-account-repository.js";
import { createTwitchTokenSecretRef } from "./twitch-oauth-service.js";
import type {
  TwitchEventSubClient,
  TwitchEventSubConnectionState,
  TwitchEventSubStatus
} from "./twitch-eventsub-client.js";

export type TwitchEventSubRuntimeState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"
  | "error";

export interface TwitchEventSubRuntimeStatus {
  readonly state: TwitchEventSubRuntimeState;
  readonly connectionState: TwitchEventSubConnectionState;
  readonly sessionId: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly subscriptionTypes: readonly string[];
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly lastEventAt: string | null;
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface TwitchEventSubRuntimeServiceOptions {
  readonly accountRepository: Pick<TwitchAccountRepository, "findConnectedAccount">;
  readonly clientId: string;
  readonly eventSubClient: Pick<TwitchEventSubClient, "connect" | "disconnect" | "getStatus">;
  readonly ingestionService: { getStatus(): EventIngestionStatus };
  readonly now?: (() => Date) | undefined;
  readonly secretStore: Pick<SecretStore, "getSecret">;
}

interface RuntimeSyncError {
  readonly message: string;
  readonly occurredAt: string;
}

export class TwitchEventSubRuntimeService {
  readonly #accountRepository: Pick<TwitchAccountRepository, "findConnectedAccount">;
  readonly #clientId: string;
  readonly #eventSubClient: Pick<TwitchEventSubClient, "connect" | "disconnect" | "getStatus">;
  readonly #ingestionService: { getStatus(): EventIngestionStatus };
  readonly #now: () => Date;
  readonly #secretStore: Pick<SecretStore, "getSecret">;
  #runtimeError: RuntimeSyncError | null = null;

  constructor(options: TwitchEventSubRuntimeServiceOptions) {
    this.#accountRepository = options.accountRepository;
    this.#clientId = options.clientId;
    this.#eventSubClient = options.eventSubClient;
    this.#ingestionService = options.ingestionService;
    this.#now = options.now ?? (() => new Date());
    this.#secretStore = options.secretStore;
  }

  async connectStoredAccount(): Promise<TwitchEventSubRuntimeStatus> {
    const account = await this.#accountRepository.findConnectedAccount();
    if (account === null) {
      this.disconnect();
      return this.getStatus();
    }

    if (this.#clientId.trim() === "") {
      this.#eventSubClient.disconnect();
      this.#runtimeError = {
        message: "Twitch EventSub client ID is not configured",
        occurredAt: this.#now().toISOString()
      };
      return this.getStatus();
    }

    let accessToken: string | null;
    try {
      accessToken = await this.#secretStore.getSecret(createTwitchTokenSecretRef(account.accountId, "access_token"));
    } catch {
      this.#eventSubClient.disconnect();
      this.#runtimeError = {
        message: runtimeSecretStoreUnavailableMessage,
        occurredAt: this.#now().toISOString()
      };
      return this.getStatus();
    }

    if (accessToken === null) {
      this.#eventSubClient.disconnect();
      this.#runtimeError = {
        message: "Twitch EventSub access token is unavailable",
        occurredAt: this.#now().toISOString()
      };
      return this.getStatus();
    }

    try {
      this.#eventSubClient.connect({
        account: {
          accountId: account.accountId,
          scopes: account.scopes
        },
        accessToken,
        clientId: this.#clientId
      });
      this.#runtimeError = null;
    } catch {
      this.#eventSubClient.disconnect();
      this.#runtimeError = {
        message: "Twitch EventSub WebSocket could not be started",
        occurredAt: this.#now().toISOString()
      };
    }

    return this.getStatus();
  }

  disconnect(): void {
    this.#runtimeError = null;
    this.#eventSubClient.disconnect();
  }

  getStatus(): TwitchEventSubRuntimeStatus {
    const connectionStatus = this.#eventSubClient.getStatus();
    const ingestionStatus = this.#ingestionService.getStatus();
    return {
      state: resolveRuntimeState(connectionStatus, ingestionStatus, this.#runtimeError),
      connectionState: connectionStatus.state,
      sessionId: connectionStatus.sessionId,
      connectedAt: connectionStatus.connectedAt,
      lastMessageAt: connectionStatus.lastMessageAt,
      subscriptionTypes: connectionStatus.subscriptionTypes,
      acceptedCount: ingestionStatus.acceptedCount,
      duplicateCount: ingestionStatus.duplicateCount,
      rejectedCount: ingestionStatus.rejectedCount,
      lastEventAt: ingestionStatus.lastEventAt,
      lastErrorAt: this.#runtimeError?.occurredAt ?? connectionStatus.lastErrorAt ?? ingestionStatus.lastErrorAt,
      message: this.#runtimeError?.message ?? connectionStatus.message ?? ingestionStatus.message
    };
  }
}

function resolveRuntimeState(
  connectionStatus: TwitchEventSubStatus,
  ingestionStatus: EventIngestionStatus,
  runtimeError: RuntimeSyncError | null
): TwitchEventSubRuntimeState {
  if (runtimeError !== null || connectionStatus.state === "error") {
    return "error";
  }

  if (connectionStatus.state === "connected" && ingestionStatus.state === "degraded") {
    return "degraded";
  }

  if (connectionStatus.state === "connected") {
    return "connected";
  }

  if (connectionStatus.state === "connecting" || connectionStatus.state === "reconnecting") {
    return connectionStatus.state;
  }

  return ingestionStatus.state === "degraded" ? "degraded" : "idle";
}
