import type { ProviderKind } from "@stream-jams/core";
import type { SqliteProviderRegistrationRepository } from "../modules/providers/sqlite-provider-registration-repository.js";

export interface EventSourceRuntimeCoordinatorOptions {
  readonly repository: Pick<SqliteProviderRegistrationRepository, "findActiveByKind">;
  readonly twitchRuntime: {
    connectStoredAccount(): Promise<unknown>;
    disconnect(): void;
  };
  readonly streamerBotRuntime: {
    syncActiveRegistration(): Promise<unknown>;
  };
  /** Kinds whose registration changed. Omit to sync every runtime; a running runtime of another kind is left alone. */
  readonly kinds?: readonly ProviderKind[] | undefined;
}

/**
 * Brings each event-source runtime in line with its own active registration. Kinds are independent:
 * one kind starting, stopping or failing never starts or stops another.
 */
export async function syncEventSourceRuntimes(options: EventSourceRuntimeCoordinatorOptions): Promise<void> {
  const syncs = (kind: ProviderKind) => options.kinds === undefined || options.kinds.includes(kind);
  const results = await Promise.allSettled([
    syncs("twitch") ? syncTwitch(options) : Promise.resolve(),
    // Streamer.bot reads its own active registration and disconnects when there is none.
    syncs("streamerbot") ? options.streamerBotRuntime.syncActiveRegistration() : Promise.resolve()
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure !== undefined) throw failure.reason;
}

async function syncTwitch(options: EventSourceRuntimeCoordinatorOptions): Promise<void> {
  if (await options.repository.findActiveByKind("twitch") === null) {
    options.twitchRuntime.disconnect();
    return;
  }
  await options.twitchRuntime.connectStoredAccount();
}
