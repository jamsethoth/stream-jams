import type { SqliteProviderRegistrationRepository } from "../modules/providers/sqlite-provider-registration-repository.js";

export interface EventSourceRuntimeCoordinatorOptions {
  readonly repository: Pick<SqliteProviderRegistrationRepository, "findActive">;
  readonly twitchRuntime: {
    connectStoredAccount(): Promise<unknown>;
    disconnect(): void;
  };
  readonly streamerBotRuntime: {
    syncActiveRegistration(): Promise<unknown>;
    disconnect(): void;
  };
}

export async function syncEventSourceRuntimes(options: EventSourceRuntimeCoordinatorOptions): Promise<void> {
  const active = await options.repository.findActive("event-source");
  if (active?.provider.kind === "twitch") {
    options.streamerBotRuntime.disconnect();
    await options.twitchRuntime.connectStoredAccount();
    return;
  }
  if (active?.provider.kind === "streamerbot") {
    options.twitchRuntime.disconnect();
    await options.streamerBotRuntime.syncActiveRegistration();
    return;
  }

  options.twitchRuntime.disconnect();
  options.streamerBotRuntime.disconnect();
}
