import type {
  ActionableManagementError,
  ProviderActivationImpact,
  ProviderSetupInput,
  ProviderValidationResult,
  ProviderVoiceTestResult,
  SecretRef
} from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import {
  ProviderActivationBlockedError,
  ProviderActivationConfirmationRequiredError,
  ProviderManagementService,
  type ProviderManagementAdapter
} from "./provider-management-service.js";
import { SqliteProviderRegistrationRepository } from "./sqlite-provider-registration-repository.js";

describe("ProviderManagementService", () => {
  let database: StreamJamsDatabase;
  let repository: SqliteProviderRegistrationRepository;
  let secrets: InMemorySecrets;
  let impacts: Map<string, ProviderActivationImpact>;
  let service: ProviderManagementService;
  let eventSourceSyncCount: number;

  beforeEach(() => {
    database = createInMemoryStreamJamsDatabase();
    repository = new SqliteProviderRegistrationRepository(database.connection, {
      now: () => new Date("2026-07-15T12:00:00.000Z")
    });
    secrets = new InMemorySecrets();
    impacts = new Map();
    eventSourceSyncCount = 0;
    let id = 0;
    service = new ProviderManagementService({
      repository,
      adapters: new Map([
        ["twitch", successfulAdapter("active")],
        ["streamerbot", successfulAdapter("active")],
        ["speakerbot", successfulAdapter(null, [{ id: "Brian", label: "Brian" }])],
        ["browser-speech", successfulAdapter(null)]
      ]),
      secretStore: secrets,
      getActivationImpact: async (providerId) => impacts.get(providerId) ?? emptyImpact,
      getUsedByAlertCount: async (kind) => (kind === "speakerbot" ? 3 : 2),
      onEventSourceChanged: async () => {
        eventSourceSyncCount += 1;
      },
      generateId: () => `provider-${++id}`,
      generateReferenceId: () => "provider-ref-1",
      now: () => new Date("2026-07-15T12:00:00.000Z")
    });
  });

  afterEach(() => database.close());

  it("does not persist a provider or credential when validation fails", async () => {
    service = new ProviderManagementService({
      repository,
      adapters: new Map([["streamerbot", failingAdapter()]]),
      secretStore: secrets,
      getActivationImpact: async () => emptyImpact,
      getUsedByAlertCount: async () => 0,
      generateId: () => "provider-failed",
      generateReferenceId: () => "provider-ref-1",
      now: () => new Date("2026-07-15T12:00:00.000Z")
    });

    const result = await service.registerProvider(streamerBotSetup());

    expect(result.status).toBe("validation-failed");
    expect(await repository.list("event-source")).toEqual([]);
    expect(secrets.values.size).toBe(0);
  });

  it("activates the first valid capability registration and keeps later providers inactive", async () => {
    const first = await service.registerProvider(twitchSetup());
    const second = await service.registerProvider(streamerBotSetup());

    expect(first.status).toBe("registered");
    expect(first.provider?.provider.active).toBe(true);
    expect(second.status).toBe("registered");
    expect(second.provider?.provider.active).toBe(false);
    expect(second.provider?.provider.intakeState).toBe("inactive");
    expect(second.provider?.configuration).toEqual({ protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" });
    expect(secrets.values.get("streamerbot:provider-2:password")).toBe("secret");
  });

  it("blocks unsafe activation and requires confirmation when impact contains warnings", async () => {
    await service.registerProvider(twitchSetup());
    const second = await service.registerProvider(streamerBotSetup());
    if (second.status !== "registered") {
      throw new Error("Expected Streamer.bot registration");
    }

    impacts.set(second.provider.provider.id, { ...emptyImpact, blockers: [managementError("Activation blocked")] });
    await expect(service.activateProvider(second.provider.provider.id, false)).rejects.toBeInstanceOf(
      ProviderActivationBlockedError
    );

    impacts.set(second.provider.provider.id, { ...emptyImpact, warnings: [managementError("Rules may stop matching")] });
    await expect(service.activateProvider(second.provider.provider.id, false)).rejects.toBeInstanceOf(
      ProviderActivationConfirmationRequiredError
    );

    const activated = await service.activateProvider(second.provider.provider.id, true);
    expect(activated.provider.active).toBe(true);
    expect(activated.replacedProviderId).toBe("provider-1");
  });

  it("deactivates an event source without deleting its registration", async () => {
    const registered = await service.registerProvider(twitchSetup());
    if (registered.status !== "registered") {
      throw new Error("Expected Twitch registration");
    }

    const deactivated = await service.deactivateProvider(registered.provider.provider.id);

    expect(deactivated).toMatchObject({ active: false, intakeState: "inactive" });
    expect(await repository.findActive("event-source")).toBeNull();
    await expect(service.getProvider(registered.provider.provider.id)).resolves.toMatchObject({
      provider: { id: registered.provider.provider.id, active: false }
    });
  });

  it("synchronizes runtime only after durable active event-source changes", async () => {
    const twitch = await service.registerProvider(twitchSetup());
    const streamerBot = await service.registerProvider(streamerBotSetup());
    if (twitch.status !== "registered" || streamerBot.status !== "registered") {
      throw new Error("Expected event-source registrations");
    }

    expect(eventSourceSyncCount).toBe(1);
    await service.activateProvider(streamerBot.provider.provider.id, true);
    expect(eventSourceSyncCount).toBe(2);
    await service.deactivateProvider(streamerBot.provider.provider.id);
    expect(eventSourceSyncCount).toBe(3);

    await service.registerProvider(speakerBotSetup());
    expect(eventSourceSyncCount).toBe(3);
  });

  it("returns derived usage, saves TTS safety, and runs a provider voice test", async () => {
    const registered = await service.registerProvider(speakerBotSetup());
    if (registered.status !== "registered") {
      throw new Error("Expected Speaker.bot registration");
    }

    const savedSafety = await service.updateTtsSafety(registered.provider.provider.id, {
      defaultVoiceId: "Brian",
      volume: 0.72,
      minimumRate: 0.8,
      maximumRate: 1.4,
      maximumTextLength: 180
    });
    const voiceTest = await service.testVoice(registered.provider.provider.id, "Stream Jams voice test");
    const listed = await service.listProviders("tts");

    expect(savedSafety.defaultVoiceId).toBe("Brian");
    expect(voiceTest).toEqual({ delivered: true, error: null });
    expect(listed[0]?.usedByAlertCount).toBe(3);
  });
});

const emptyImpact: ProviderActivationImpact = {
  matchedAlertCount: 0,
  unmatchedAlertCount: 0,
  blockers: [],
  warnings: []
};

function successfulAdapter(
  intakeState: ProviderValidationResult["intakeState"],
  availableVoices: ProviderValidationResult["availableVoices"] = []
): ProviderManagementAdapter {
  return {
    async validate(): Promise<ProviderValidationResult> {
      return {
        valid: true,
        connectionState: "connected",
        intakeState,
        validatedAt: "2026-07-15T12:00:00.000Z",
        availableVoices,
        error: null
      };
    },
    async testVoice(): Promise<ProviderVoiceTestResult> {
      return { delivered: true, error: null };
    }
  };
}

function failingAdapter(): ProviderManagementAdapter {
  return {
    async validate() {
      return {
        valid: false,
        connectionState: "error" as const,
        intakeState: "error" as const,
        validatedAt: "2026-07-15T12:00:00.000Z",
        availableVoices: [],
        error: managementError("Streamer.bot is unreachable")
      };
    }
  };
}

function managementError(summary: string): ActionableManagementError {
  return {
    summary,
    cause: "The local WebSocket server did not respond.",
    nextStep: "Start the integration WebSocket server and retry.",
    severity: "error",
    occurredAt: "2026-07-15T12:00:00.000Z",
    referenceId: "provider-ref-1",
    correction: { label: "Open Diagnostics", route: "/manage/diagnostics?reference=provider-ref-1" }
  };
}

function twitchSetup(): ProviderSetupInput {
  return { name: "Main Twitch", kind: "twitch", configuration: {} };
}

function streamerBotSetup(): ProviderSetupInput {
  return {
    name: "Local Streamer.bot",
    kind: "streamerbot",
    configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" },
    credential: "secret"
  };
}

function speakerBotSetup(): ProviderSetupInput {
  return {
    name: "Speaker.bot",
    kind: "speakerbot",
    configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" }
  };
}

class InMemorySecrets {
  readonly values = new Map<string, string>();

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.values.set(key(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.values.get(key(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.values.delete(key(ref));
  }
}

function key(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}
