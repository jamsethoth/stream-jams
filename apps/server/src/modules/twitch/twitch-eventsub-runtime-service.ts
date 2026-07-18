import { randomBytes } from "node:crypto";
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
  readonly referenceId: string | null;
}

export interface TwitchEventSubRuntimeDiagnostic {
  readonly message: string;
  readonly referenceId: string;
}

export interface TwitchEventSubRuntimeServiceOptions {
  readonly accountRepository: Pick<TwitchAccountRepository, "findConnectedAccount">;
  readonly clientId: string;
  readonly eventSubClient: Pick<TwitchEventSubClient, "connect" | "disconnect" | "getStatus">;
  readonly ingestionService: { getStatus(): EventIngestionStatus };
  readonly now?: (() => Date) | undefined;
  readonly secretStore: Pick<SecretStore, "getSecret">;
  readonly generateReferenceId?: (() => string) | undefined;
  readonly onDiagnostic?: ((entry: TwitchEventSubRuntimeDiagnostic) => void | Promise<void>) | undefined;
  readonly validateConnectedAccount?: (() => void | Promise<void>) | undefined;
}

interface RuntimeSyncError {
  readonly message: string;
  readonly occurredAt: string;
  readonly referenceId: string;
}

export class TwitchEventSubRuntimeService {
  readonly #accountRepository: Pick<TwitchAccountRepository, "findConnectedAccount">;
  readonly #clientId: string;
  readonly #eventSubClient: Pick<TwitchEventSubClient, "connect" | "disconnect" | "getStatus">;
  readonly #ingestionService: { getStatus(): EventIngestionStatus };
  readonly #now: () => Date;
  readonly #secretStore: Pick<SecretStore, "getSecret">;
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<TwitchEventSubRuntimeServiceOptions["onDiagnostic"]>;
  readonly #validateConnectedAccount: NonNullable<TwitchEventSubRuntimeServiceOptions["validateConnectedAccount"]>;
  #runtimeError: RuntimeSyncError | null = null;

  constructor(options: TwitchEventSubRuntimeServiceOptions) {
    this.#accountRepository = options.accountRepository;
    this.#clientId = options.clientId;
    this.#eventSubClient = options.eventSubClient;
    this.#ingestionService = options.ingestionService;
    this.#now = options.now ?? (() => new Date());
    this.#secretStore = options.secretStore;
    this.#generateReferenceId = options.generateReferenceId ?? generateReferenceId;
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
    this.#validateConnectedAccount = options.validateConnectedAccount ?? (() => {});
  }

  async connectStoredAccount(): Promise<TwitchEventSubRuntimeStatus> {
    try {
      await this.#validateConnectedAccount();
    } catch {
      this.#eventSubClient.disconnect();
      await this.#recordRuntimeError("Twitch authorization could not be validated or refreshed");
      return this.getStatus();
    }

    const account = await this.#accountRepository.findConnectedAccount();
    if (account === null) {
      this.#eventSubClient.disconnect();
      await this.#recordRuntimeError("Twitch account connection is unavailable");
      return this.getStatus();
    }

    if (this.#clientId.trim() === "") {
      this.#eventSubClient.disconnect();
      await this.#recordRuntimeError("Twitch EventSub client ID is not configured");
      return this.getStatus();
    }

    let accessToken: string | null;
    try {
      accessToken = await this.#secretStore.getSecret(createTwitchTokenSecretRef(account.accountId, "access_token"));
    } catch {
      this.#eventSubClient.disconnect();
      await this.#recordRuntimeError(runtimeSecretStoreUnavailableMessage);
      return this.getStatus();
    }

    if (accessToken === null) {
      this.#eventSubClient.disconnect();
      await this.#recordRuntimeError("Twitch EventSub access token is unavailable");
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
      await this.#recordRuntimeError("Twitch EventSub WebSocket could not be started");
    }

    return this.getStatus();
  }

  disconnect(): void {
    this.#runtimeError = null;
    this.#eventSubClient.disconnect();
  }

  async reportAuthorizationFailure(): Promise<TwitchEventSubRuntimeStatus> {
    this.#eventSubClient.disconnect();
    await this.#recordRuntimeError("Twitch authorization could not be validated or refreshed");
    return this.getStatus();
  }

  getStatus(): TwitchEventSubRuntimeStatus {
    const connectionStatus = this.#eventSubClient.getStatus();
    const ingestionStatus = this.#ingestionService.getStatus();
    const includeIngestionIssue = connectionStatus.state === "connected";
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
      lastErrorAt: this.#runtimeError?.occurredAt
        ?? connectionStatus.lastErrorAt
        ?? (includeIngestionIssue ? ingestionStatus.lastErrorAt : null),
      message: this.#runtimeError?.message
        ?? connectionStatus.message
        ?? (includeIngestionIssue ? ingestionStatus.message : null),
      referenceId: this.#runtimeError?.referenceId
        ?? connectionStatus.referenceId
        ?? (includeIngestionIssue ? ingestionStatus.referenceId : null)
    };
  }

  async #recordRuntimeError(message: string): Promise<void> {
    const referenceId = this.#generateReferenceId();
    this.#runtimeError = {
      message,
      occurredAt: this.#now().toISOString(),
      referenceId
    };
    try {
      await this.#onDiagnostic({ message, referenceId });
    } catch {
      this.#runtimeError = {
        ...this.#runtimeError,
        message: "Twitch EventSub diagnostics logging failed"
      };
    }
  }
}

function generateReferenceId(): string {
  return `ref_${randomBytes(12).toString("base64url")}`;
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

  return "idle";
}
