import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import {
  SqliteProviderRegistrationRepository,
  type ProviderRegistrationRecord
} from "./sqlite-provider-registration-repository.js";

describe("SqliteProviderRegistrationRepository", () => {
  let database: StreamJamsDatabase;
  let repository: SqliteProviderRegistrationRepository;

  beforeEach(() => {
    database = createInMemoryStreamJamsDatabase();
    repository = new SqliteProviderRegistrationRepository(database.connection);
  });

  afterEach(() => database.close());

  it("round-trips provider configuration, validation state, and a separate secret reference", async () => {
    const saved = await repository.save(providerRecord());

    expect(await repository.findById(saved.provider.id)).toEqual(saved);
    expect(database.connection.prepare("SELECT non_secret_config_json, secret_ref_json FROM provider_registrations").get()).toEqual({
      non_secret_config_json: JSON.stringify(saved.configuration),
      secret_ref_json: JSON.stringify(saved.secretRef)
    });
  });

  it("atomically replaces the active provider for one capability only", async () => {
    await repository.save(providerRecord());
    await repository.save(
      providerRecord({
        provider: {
          ...providerRecord().provider,
          id: "provider-streamerbot",
          name: "Local Streamer.bot",
          kind: "streamerbot",
          active: false,
          intakeState: "inactive"
        },
        configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
      })
    );
    await repository.save(
      providerRecord({
        provider: {
          ...providerRecord().provider,
          id: "provider-speakerbot",
          name: "Speaker.bot",
          kind: "speakerbot",
          capability: "tts",
          active: true,
          intakeState: null
        },
        configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" },
        secretRef: null,
        ttsSafety: {
          defaultVoiceId: "Brian",
          volume: 0.8,
          minimumRate: 0.5,
          maximumRate: 2,
          maximumTextLength: 180
        }
      })
    );

    const result = await repository.activate("provider-streamerbot");

    expect(result.replacedProviderId).toBe("provider-twitch");
    expect((await repository.findById("provider-streamerbot"))?.provider.active).toBe(true);
    expect((await repository.findById("provider-twitch"))?.provider.active).toBe(false);
    expect((await repository.findById("provider-speakerbot"))?.provider.active).toBe(true);
  });

  it("updates provider-owned TTS safety settings", async () => {
    const initial = providerRecord({
      provider: {
        ...providerRecord().provider,
        id: "provider-speakerbot",
        name: "Speaker.bot",
        kind: "speakerbot",
        capability: "tts",
        intakeState: null
      },
      configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" },
      secretRef: null,
      ttsSafety: {
        defaultVoiceId: null,
        volume: 1,
        minimumRate: 0.5,
        maximumRate: 2,
        maximumTextLength: 240
      }
    });
    await repository.save(initial);

    const updated = await repository.updateTtsSafety(initial.provider.id, {
      defaultVoiceId: "Brian",
      volume: 0.72,
      minimumRate: 0.8,
      maximumRate: 1.4,
      maximumTextLength: 180
    });

    expect(updated?.ttsSafety).toEqual({
      defaultVoiceId: "Brian",
      volume: 0.72,
      minimumRate: 0.8,
      maximumRate: 1.4,
      maximumTextLength: 180
    });
  });
});

function providerRecord(overrides: Partial<ProviderRegistrationRecord> = {}): ProviderRegistrationRecord {
  return {
    provider: {
      id: "provider-twitch",
      name: "Main Twitch",
      kind: "twitch",
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      validatedAt: "2026-07-15T12:00:00.000Z",
      error: null,
      usedByAlertCount: 2
    },
    configuration: { accountId: "account-1", login: "jamsethoth" },
    availableVoices: [],
    secretRef: { namespace: "streamerbot", accountId: "provider-twitch", name: "password" },
    ttsSafety: null,
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...overrides
  };
}
