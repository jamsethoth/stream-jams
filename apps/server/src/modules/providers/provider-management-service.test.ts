import type {
  ActionableManagementError,
  Logger,
  ProviderActivationImpact,
  ProviderSetupInput,
  ProviderValidationResult,
  ProviderVoiceTestResult,
  SecretRef,
  StreamerBotSubscriptionSelection
} from "@stream-jams/core";
import { pearConfigurationSchema } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import {
  ProviderActivationBlockedError,
  ProviderActivationConfirmationRequiredError,
  ProviderManagementService,
  StreamerBotSubscriptionSelectionUnavailableError,
  StreamerBotSubscriptionWrongProviderError,
  type ProviderManagementAdapter
} from "./provider-management-service.js";
import { SqliteProviderRegistrationRepository } from "./sqlite-provider-registration-repository.js";
import { PearPairingService } from "../music/pear-pairing-service.js";
import { RuntimeMaintenanceGate, RuntimeMaintenanceUnavailableError } from "../backup/runtime-maintenance-gate.js";

describe("ProviderManagementService", () => {
  let database: StreamJamsDatabase;
  let repository: SqliteProviderRegistrationRepository;
  let secrets: InMemorySecrets;
  let impacts: Map<string, ProviderActivationImpact>;
  let service: ProviderManagementService;
  let eventSourceSyncCount: number;
  let musicSourceSyncCount: number;
  let logger: Pick<Logger, "error">;
  let pairing: PearPairingService;

  beforeEach(() => {
    database = createInMemoryStreamJamsDatabase();
    repository = new SqliteProviderRegistrationRepository(database.connection, {
      now: () => new Date("2026-07-15T12:00:00.000Z")
    });
    secrets = new InMemorySecrets();
    impacts = new Map();
    eventSourceSyncCount = 0;
    musicSourceSyncCount = 0;
    logger = { error: vi.fn(async () => {}) };
    pairing = new PearPairingService({
      identityStore: secrets,
      requestApproval: async () => ({ status: 200, body: { accessToken: "music-secret" } }),
      generateClientId: () => "client-stable",
      now: () => Date.now()
    });
    let id = 0;
    service = new ProviderManagementService({
      repository,
      adapters: new Map([
        ["twitch", successfulAdapter("active")],
        ["streamerbot", successfulAdapter("active")],
        ["speakerbot", successfulAdapter(null, [{ id: "Brian", label: "Brian" }])],
        ["browser-speech", successfulAdapter(null)],
        ["pear-desktop", successfulAdapter(null)]
      ]),
      secretStore: secrets,
      musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async (providerId) => impacts.get(providerId) ?? emptyImpact,
      getUsedByAlertCount: async (kind) => (kind === "speakerbot" ? 3 : 2),
      onEventSourceChanged: async () => {
        eventSourceSyncCount += 1;
      },
      onMusicSourceChanged: async () => { musicSourceSyncCount += 1; },
      generateId: () => `provider-${++id}`,
      generateReferenceId: () => "provider-ref-1",
      logger,
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
    expect(second.provider?.configuration).toEqual({
      protocol: "ws",
      host: "127.0.0.1",
      port: 8080,
      endpoint: "/",
      twitchBroadcasterId: null,
      externalSubscriptions: []
    });
    expect(secrets.values.get("streamerbot:provider-2:password")).toBe("secret");
  });

  it("selects Music independently and only notifies the Music source callback", async () => {
    await service.registerProvider(twitchSetup());
    const first = await service.registerProvider(await pearSetup("Pear A"));
    const second = await service.registerProvider(await pearSetup("Pear B"));
    expect(first.status).toBe("registered");
    expect(second.status).toBe("registered");
    expect(first.provider?.provider).toMatchObject({ capability: "music-source", active: true, intakeState: null });
    expect(second.provider?.provider.active).toBe(false);
    expect(eventSourceSyncCount).toBe(1);
    expect(musicSourceSyncCount).toBe(1);
    if (second.status !== "registered") throw new Error("Expected second Music source");
    await service.activateProvider(second.provider.provider.id, false);
    expect((await repository.findActive("music-source"))?.provider.id).toBe(second.provider.provider.id);
    expect((await repository.findActive("event-source"))?.provider.kind).toBe("twitch");
    expect(eventSourceSyncCount).toBe(1);
    expect(musicSourceSyncCount).toBe(2);
    await service.deactivateProvider(second.provider.provider.id);
    expect(musicSourceSyncCount).toBe(3);
  });

  it("keeps a whole admitted Pear registration inside the restore exclusion gate", async () => {
    const gate = new RuntimeMaintenanceGate();
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const guarded = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => { entered(); await blocked; return { valid: true, connectionState: "connected", intakeState: null,
        validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }; },
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "guarded-pear", generateReferenceId: () => "ref-guarded",
      runMusicMutation: work => gate.runIntake(work)
    });
    const registration = guarded.registerProvider(await pearSetup("Pear"));
    await started;
    await expect(gate.runMaintenance(async () => "restore")).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError);
    release();
    expect((await registration).status).toBe("registered");
    expect(await gate.runMaintenance(async () => "restore")).toBe("restore");
  });

  it("counts queued replacements through old-secret retirement before restore can begin", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const first = await pearSetup("Pear");
    const second = await pearSetup("Pear");
    if (first.kind !== "pear-desktop" || second.kind !== "pear-desktop" || first.pairingAttemptId === undefined || second.pairingAttemptId === undefined) throw new Error("Expected pairings");
    const gate = new RuntimeMaintenanceGate();
    const guarded = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null,
        validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "unused", generateReferenceId: () => "ref-guarded",
      onMusicSourceChanged: async () => {}, runMusicMutation: work => gate.runIntake(work)
    });
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalDelete = secrets.deleteSecret.bind(secrets);
    secrets.deleteSecret = async ref => {
      if (ref.namespace === "music" && ref.name === "access-token") { entered(); await blocked; }
      await originalDelete(ref);
    };
    const replaceOne = guarded.replaceMusicCredential(id, { pairingAttemptId: first.pairingAttemptId, configuration: pearConfigurationSchema.parse(first.configuration) });
    await started;
    const replaceTwo = guarded.replaceMusicCredential(id, { pairingAttemptId: second.pairingAttemptId, configuration: pearConfigurationSchema.parse(second.configuration) });
    try {
      expect(gate.activeIntakeCount).toBe(2);
      await expect(gate.runMaintenance(async () => "restore")).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError);
    } finally { release(); }
    expect((await replaceOne).validation.valid).toBe(true);
    expect((await replaceTwo).validation.valid).toBe(true);
    const current = await repository.findById(id);
    expect([...secrets.values.keys()].filter(key => key.includes("access-token"))).toEqual([`music:${id}:${current?.secretRef?.name}`]);
    expect(await gate.runMaintenance(async () => "restore")).toBe("restore");
  });

  it("holds Music selection and its runtime callback inside restore exclusion", async () => {
    const first = await service.registerProvider(await pearSetup("Pear A"));
    const second = await service.registerProvider(await pearSetup("Pear B"));
    if (first.status !== "registered" || second.status !== "registered") throw new Error("Expected registrations");
    const gate = new RuntimeMaintenanceGate();
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const guarded = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets,
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "unused", generateReferenceId: () => "ref-guarded",
      onMusicSourceChanged: async () => { entered(); await blocked; },
      runMusicMutation: work => gate.runIntake(work)
    });
    const selecting = guarded.activateProvider(second.provider.provider.id, false);
    await started;
    try { await expect(gate.runMaintenance(async () => "restore")).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError); }
    finally { release(); }
    expect((await selecting).provider.id).toBe(second.provider.provider.id);
    expect(await gate.runMaintenance(async () => "restore")).toBe("restore");
  });

  it("re-pairs a Music registration with a fresh secret ref while preserving its identity and selection", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const before = await repository.findById(id);
    const next = await pearSetup("ignored name");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    const result = await service.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) });
    const after = await repository.findById(id);
    expect(result).toMatchObject({ validation: { valid: true }, runtimeReconcilePending: false, credentialRetirementPending: false });
    expect(after?.provider).toMatchObject({ id, name: "Pear", active: true });
    expect(after?.secretRef).not.toEqual(before?.secretRef);
    expect(after?.secretRef === null || after?.secretRef === undefined ? null : await secrets.getSecret(after.secretRef)).toBe("music-secret");
    expect(before?.secretRef === null || before?.secretRef === undefined ? null : await secrets.getSecret(before.secretRef)).toBeNull();
    expect(pairing.get(next.pairingAttemptId).status).toBe("cancelled");
  });

  it("keeps old Music credential and record if a partial new-secret write fails", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const before = await repository.findById(id);
    const next = await pearSetup("Pear");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    const baseSet = secrets.setSecret.bind(secrets);
    secrets.setSecret = async (ref, value) => { await baseSet(ref, value); if (ref.name.startsWith("access-token-")) throw new Error("new keyring write failed"); };
    await expect(service.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) })).rejects.toThrow("new keyring write failed");
    expect(await repository.findById(id)).toEqual(before);
    expect(secrets.values.get(`music:${id}:access-token`)).toBe("music-secret");
    expect([...secrets.values.keys()].filter(key => key.includes("access-token-"))).toEqual([]);
  });

  it("leaves the old Music credential in place when re-pair validation fails", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const before = await repository.findById(id);
    const rejected = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => { throw new Error("sensitive upstream failure"); },
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "unused", generateReferenceId: () => "ref-validation"
    });
    const next = await pearSetup("Pear");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    const result = await rejected.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) });
    expect(result.validation.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sensitive upstream failure");
    expect(await repository.findById(id)).toEqual(before);
    expect(secrets.values.get(`music:${id}:access-token`)).toBe("music-secret");
  });

  it("compensates a replacement cancelled after its provisional keyring write", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const before = await repository.findById(id);
    const next = await pearSetup("Pear");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    const originalSet = secrets.setSecret.bind(secrets);
    secrets.setSecret = async (ref, value) => {
      await originalSet(ref, value);
      if (ref.name.startsWith("access-token-")) await pairing.cancel(next.pairingAttemptId!);
    };
    await expect(service.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) })).rejects.toThrow("no longer approved");
    expect(await repository.findById(id)).toEqual(before);
    expect(secrets.values.get(`music:${id}:access-token`)).toBe("music-secret");
    expect([...secrets.values.keys()].filter(key => key.includes("access-token-"))).toEqual([]);
  });

  it("keeps old Music credential and record if durable replacement fails", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const before = await repository.findById(id);
    const next = await pearSetup("Pear");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("replacement save failed"));
    await expect(service.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) })).rejects.toThrow("replacement save failed");
    expect(await repository.findById(id)).toEqual(before);
    expect(secrets.values.get(`music:${id}:access-token`)).toBe("music-secret");
    expect([...secrets.values.keys()].filter(key => key.includes("access-token-"))).toEqual([]);
  });

  it("reports postcommit callback failure as committed and permits a safe retry", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const replacement = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      onMusicSourceChanged: async () => { throw new Error("runtime unavailable"); },
      generateId: () => "unused", generateReferenceId: () => "ref-test"
    });
    const next = await pearSetup("Pear");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    const result = await replacement.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) });
    expect(result).toMatchObject({ validation: { valid: true }, runtimeReconcilePending: true });
    const durable = await repository.findById(id);
    expect(durable?.secretRef?.name).toMatch(/^access-token-/);
    expect(durable?.provider.active).toBe(true);
    expect(secrets.values.has(`music:${id}:access-token`)).toBe(false);
    expect(pairing.get(next.pairingAttemptId).status).toBe("cancelled");
    const retry = await pearSetup("Pear");
    if (retry.kind !== "pear-desktop" || retry.pairingAttemptId === undefined) throw new Error("Expected pairing");
    expect((await service.replaceMusicCredential(id, { pairingAttemptId: retry.pairingAttemptId, configuration: pearConfigurationSchema.parse(retry.configuration) })).validation.valid).toBe(true);
  });

  it("serializes two approved replacements and retires only superseded credentials", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear"));
    if (initial.status !== "registered") throw new Error("Expected registration");
    const id = initial.provider.provider.id;
    const first = await pearSetup("Pear");
    const second = await pearSetup("Pear");
    if (first.kind !== "pear-desktop" || second.kind !== "pear-desktop" || first.pairingAttemptId === undefined || second.pairingAttemptId === undefined) throw new Error("Expected pairings");
    const [one, two] = await Promise.all([
      service.replaceMusicCredential(id, { pairingAttemptId: first.pairingAttemptId, configuration: pearConfigurationSchema.parse(first.configuration) }),
      service.replaceMusicCredential(id, { pairingAttemptId: second.pairingAttemptId, configuration: pearConfigurationSchema.parse(second.configuration) })
    ]);
    expect(one.validation.valid && two.validation.valid).toBe(true);
    const current = await repository.findById(id);
    expect(current?.provider).toMatchObject({ id, active: true });
    expect(current?.secretRef?.name).toMatch(/^access-token-/);
    expect([...secrets.values.keys()].filter(key => key.includes("access-token"))).toEqual([`music:${id}:${current?.secretRef?.name}`]);
  });

  it("preserves selection changed while a replacement secret is being stored", async () => {
    const initial = await service.registerProvider(await pearSetup("Pear A"));
    const alternate = await service.registerProvider(await pearSetup("Pear B"));
    if (initial.status !== "registered" || alternate.status !== "registered") throw new Error("Expected registrations");
    const id = initial.provider.provider.id;
    const next = await pearSetup("Pear A");
    if (next.kind !== "pear-desktop" || next.pairingAttemptId === undefined) throw new Error("Expected pairing");
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalSet = secrets.setSecret.bind(secrets);
    secrets.setSecret = async (ref, value) => { if (ref.name.startsWith("access-token-")) { entered(); await blocked; } await originalSet(ref, value); };
    const replacing = service.replaceMusicCredential(id, { pairingAttemptId: next.pairingAttemptId, configuration: pearConfigurationSchema.parse(next.configuration) });
    await started;
    await service.activateProvider(alternate.provider.provider.id, false);
    release();
    await replacing;
    expect((await repository.findById(id))?.provider.active).toBe(false);
    expect((await repository.findActive("music-source"))?.provider.id).toBe(alternate.provider.provider.id);
  });

  async function pearSetup(name: string): Promise<ProviderSetupInput> {
    const attempt = await pairing.begin({ baseUrl: "http://127.0.0.1:26538", transport: "auto" });
    await vi.waitFor(() => expect(pairing.get(attempt.attemptId).status).toBe("approved"));
    return { name, kind: "pear-desktop", configuration: {}, pairingAttemptId: attempt.attemptId };
  }

  it("requires an approved server-side attempt and never returns its token", async () => {
    const unpaired = await service.registerProvider({ name: "Pear", kind: "pear-desktop", configuration: {} });
    expect(unpaired.status).toBe("validation-failed");
    const registered = await service.registerProvider(await pearSetup("Pear"));
    expect(registered.status).toBe("registered");
    expect(JSON.stringify(registered)).not.toContain("music-secret");
    expect(JSON.stringify(registered)).not.toContain("client-stable");
    expect(secrets.values.get("music:provider-1:access-token")).toBe("music-secret");
  });

  it("connection-test validation leaves the approved attempt available and does not register", async () => {
    const setup = await pearSetup("Pear");
    const checked = await service.validateProvider(setup);
    expect(checked.valid).toBe(true);
    expect(await repository.list("music-source")).toEqual([]);
    expect((await service.registerProvider(setup)).status).toBe("registered");
  });

  it("preserves the original Music credential when a second registration cannot persist", async () => {
    const first = await service.registerProvider(await pearSetup("Original"));
    if (first.status !== "registered") throw new Error("Expected original registration");
    database.connection.exec(`CREATE TRIGGER reject_second_music BEFORE INSERT ON provider_registrations
      WHEN NEW.capability = 'music-source' BEGIN SELECT RAISE(FAIL, 'save failed'); END`);
    await expect(service.registerProvider(await pearSetup("Replacement"))).rejects.toThrow("save failed");
    expect((await repository.findActive("music-source"))?.provider.id).toBe(first.provider.provider.id);
    expect(secrets.values.get("music:provider-1:access-token")).toBe("music-secret");
    expect(secrets.values.has("music:provider-2:access-token")).toBe(false);
  });

  it("removes a partly written Music credential when the secret store fails", async () => {
    const partialStore = new InMemorySecrets();
    const baseSet = partialStore.setSecret.bind(partialStore);
    partialStore.setSecret = async (ref, value) => {
      await baseSet(ref, value);
      if (ref.name === "access-token") throw new Error("keyring write failed");
    };
    service = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: partialStore, musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "provider-partial", generateReferenceId: () => "ref-partial"
    });
    await expect(service.registerProvider(await pearSetup("Pear"))).rejects.toThrow("keyring write failed");
    expect(await repository.list("music-source")).toEqual([]);
    expect(partialStore.values.has("music:provider-partial:access-token")).toBe(false);
  });

  it("keeps a durable Music credential if runtime notification fails after save", async () => {
    service = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "provider-runtime-error", generateReferenceId: () => "ref-runtime-error",
      onMusicSourceChanged: async () => { throw new Error("runtime unavailable"); }
    });
    const result = await service.registerProvider(await pearSetup("Pear"));
    expect(result.status).toBe("registered");
    expect((await repository.findActive("music-source"))?.provider.id).toBe("provider-runtime-error");
    expect(secrets.values.get("music:provider-runtime-error:access-token")).toBe("music-secret");
  });

  it("refuses a cancelled attempt after validation finishes", async () => {
    let release!: () => void;
    service = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return { valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null };
      },
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "provider-cancelled", generateReferenceId: () => "ref-cancelled"
    });
    const setup = await pearSetup("Pear");
    const registration = service.registerProvider(setup);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    if (setup.kind !== "pear-desktop" || setup.pairingAttemptId === undefined) throw new Error("No pairing attempt");
    await pairing.cancel(setup.pairingAttemptId);
    release();
    await expect(registration).rejects.toThrow("Pear pairing attempt");
    expect(await repository.list("music-source")).toEqual([]);
    expect(secrets.values.has("music:provider-cancelled:access-token")).toBe(false);
  });

  it("lets only one concurrent registration consume an approved pairing", async () => {
    const setup = await pearSetup("Pear");
    const [first, second] = await Promise.allSettled([
      service.registerProvider(setup), service.registerProvider(setup)
    ]);
    expect([first, second].filter((result) => result.status === "fulfilled" && result.value.status === "registered")).toHaveLength(1);
    expect(await repository.list("music-source")).toHaveLength(1);
    expect([...secrets.values.keys()].filter((key) => key.endsWith(":access-token"))).toHaveLength(1);
  });

  it("rolls back a Music record and credential if pairing is cancelled during the database write", async () => {
    let releaseSave!: () => void;
    let saved!: () => void;
    const savedSignal = new Promise<void>((resolve) => { saved = resolve; });
    repository = new class extends SqliteProviderRegistrationRepository {
      override async save(record: Parameters<SqliteProviderRegistrationRepository["save"]>[0]) {
        const result = await super.save(record);
        if (record.provider.kind === "pear-desktop") {
          saved();
          await new Promise<void>((resolve) => { releaseSave = resolve; });
        }
        return result;
      }
    }(database.connection);
    service = new ProviderManagementService({
      repository, adapters: new Map(), secretStore: secrets, musicPairing: pairing,
      validateMusicConnection: async () => ({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }),
      getActivationImpact: async () => emptyImpact, getUsedByAlertCount: async () => 0,
      generateId: () => "provider-late-cancel", generateReferenceId: () => "ref-late-cancel"
    });
    const setup = await pearSetup("Pear");
    const registration = service.registerProvider(setup);
    await savedSignal;
    if (setup.kind !== "pear-desktop" || setup.pairingAttemptId === undefined) throw new Error("No pairing attempt");
    await pairing.cancel(setup.pairingAttemptId);
    releaseSave();
    await expect(registration).rejects.toThrow("Pear pairing attempt");
    expect(await repository.list("music-source")).toEqual([]);
    expect(secrets.values.has("music:provider-late-cancel:access-token")).toBe(false);
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

  it("records failed voice tests under the returned diagnostics reference", async () => {
    service = new ProviderManagementService({
      repository,
      adapters: new Map([
        [
          "speakerbot",
          {
            ...successfulAdapter(null, [{ id: "Brian", label: "Brian" }]),
            async testVoice() {
              throw new Error("Speaker.bot requires a default voice before it can be tested.");
            }
          }
        ]
      ]),
      secretStore: secrets,
      getActivationImpact: async () => emptyImpact,
      getUsedByAlertCount: async () => 0,
      generateId: () => "provider-speakerbot",
      generateReferenceId: () => "provider-ref-voice-test",
      logger,
      now: () => new Date("2026-07-15T12:00:00.000Z")
    });
    const registered = await service.registerProvider(speakerBotSetup());
    if (registered.status !== "registered") {
      throw new Error("Expected Speaker.bot registration");
    }

    const result = await service.testVoice(registered.provider.provider.id, "Stream Jams voice test");

    expect(result).toMatchObject({
      delivered: false,
      error: {
        cause: "Speaker.bot requires a default voice before it can be tested.",
        nextStep: "Review the provider error, correct the voice alias or connection settings, then retry the voice test.",
        referenceId: "provider-ref-voice-test"
      }
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Speaker.bot requires a default voice before it can be tested.",
      {
        module: "providers",
        source: "provider.management.failure",
        correlationId: "provider-ref-voice-test",
        processingId: null,
        metadata: {
          summary: "Voice test failed",
          nextStep: "Review the provider error, correct the voice alias or connection settings, then retry the voice test."
        }
      }
    );
  });

  it("lists and atomically updates active Streamer.bot subscriptions", async () => {
    const applied: Array<{
      next: readonly StreamerBotSubscriptionSelection[];
      broadcasterId: string | null;
    }> = [];
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ Twitch: ["RewardRedemption"], OBS: ["SceneChanged", "RecordingStarted"] }),
      async replaceExternalSubscriptions(_providerId, next, broadcasterId) {
        applied.push({ next, broadcasterId });
        return runtimeMutation();
      }
    });
    const registered = await service.registerProvider(streamerBotSetup());
    if (registered.status !== "registered") throw new Error("Expected Streamer.bot registration");

    await expect(service.getStreamerBotSubscriptions(registered.provider.provider.id)).resolves.toMatchObject({
      available: true,
      sources: [
        { sourceKey: "OBS", eventTypes: ["RecordingStarted", "SceneChanged"] },
        { sourceKey: "Twitch", eventTypes: ["RewardRedemption"] }
      ],
      selected: []
    });

    const updated = await service.updateStreamerBotSubscriptions(registered.provider.provider.id, {
      twitchBroadcasterId: "broadcaster-1",
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    });

    expect(applied).toEqual([{
      next: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }],
      broadcasterId: "broadcaster-1"
    }]);
    expect(updated).toMatchObject({
      selected: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }],
      twitchBroadcasterId: "broadcaster-1",
      unavailableSelections: []
    });
    await expect(service.getProvider(registered.provider.provider.id)).resolves.toMatchObject({
      configuration: {
        twitchBroadcasterId: "broadcaster-1",
        externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
      }
    });
  });

  it("rejects wrong providers and vanished advertised selections before persistence", async () => {
    let applyCount = 0;
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ OBS: ["SceneChanged"] }),
      async replaceExternalSubscriptions() {
        applyCount += 1;
        return runtimeMutation();
      }
    });
    const bot = await service.registerProvider(streamerBotSetup());
    const speaker = await service.registerProvider(speakerBotSetup());
    if (bot.status !== "registered" || speaker.status !== "registered") throw new Error("Expected registrations");

    await expect(service.getStreamerBotSubscriptions(speaker.provider.provider.id)).rejects.toBeInstanceOf(
      StreamerBotSubscriptionWrongProviderError
    );
    await expect(service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: null,
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["Missing"] }]
    })).rejects.toBeInstanceOf(StreamerBotSubscriptionSelectionUnavailableError);
    expect(applyCount).toBe(0);
    await expect(service.getProvider(bot.provider.provider.id)).resolves.toMatchObject({
      configuration: { externalSubscriptions: [] }
    });
  });

  it("does not persist subscriptions when live apply fails", async () => {
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ OBS: ["SceneChanged"] }),
      async replaceExternalSubscriptions() { throw new Error("apply failed"); }
    });
    const bot = await service.registerProvider(streamerBotSetup());
    if (bot.status !== "registered") throw new Error("Expected Streamer.bot registration");

    await expect(service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: null,
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    })).rejects.toThrow("apply failed");
    await expect(service.getProvider(bot.provider.provider.id)).resolves.toMatchObject({
      configuration: { externalSubscriptions: [] }
    });
  });

  it("rolls live subscriptions back when durable persistence fails", async () => {
    const events: string[] = [];
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ OBS: ["SceneChanged"] }),
      async replaceExternalSubscriptions() {
        events.push("apply");
        return runtimeMutation(async () => { events.push("rollback"); });
      }
    });
    const bot = await service.registerProvider(streamerBotSetup());
    if (bot.status !== "registered") throw new Error("Expected Streamer.bot registration");
    database.connection.exec(`
      CREATE TRIGGER reject_provider_subscription_update
      BEFORE UPDATE ON provider_registrations
      BEGIN
        SELECT RAISE(FAIL, 'persistence failed');
      END
    `);

    await expect(service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: "broadcaster-1",
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    })).rejects.toThrow("persistence failed");
    expect(events).toEqual(["apply", "rollback"]);
  });

  it("preserves the persistence error when live rollback also fails", async () => {
    const persistenceError = new Error("persistence failed");
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ OBS: ["SceneChanged"] }),
      async replaceExternalSubscriptions() {
        return runtimeMutation(async () => { throw new Error("rollback failed"); });
      }
    });
    const bot = await service.registerProvider(streamerBotSetup());
    if (bot.status !== "registered") throw new Error("Expected Streamer.bot registration");
    vi.spyOn(repository, "save").mockRejectedValueOnce(persistenceError);

    const update = service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: null,
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    });

    await expect(update).rejects.toMatchObject({
      name: "AggregateError",
      cause: persistenceError,
      errors: [persistenceError, expect.objectContaining({ message: "rollback failed" })]
    });
  });

  it("serializes overlapping Streamer.bot subscription saves", async () => {
    const applied: string[][] = [];
    service = createSubscriptionService(repository, secrets, {
      getCatalog: async () => ({ OBS: ["SceneChanged", "RecordingStarted"] }),
      async replaceExternalSubscriptions(_providerId, next) {
        applied.push(next.flatMap((selection) => selection.eventTypes));
        return runtimeMutation();
      }
    });
    const bot = await service.registerProvider(streamerBotSetup());
    if (bot.status !== "registered") throw new Error("Expected Streamer.bot registration");

    const save = repository.save.bind(repository);
    let releaseFirstSave!: () => void;
    let firstSave = true;
    vi.spyOn(repository, "save").mockImplementation(async (record) => {
      if (firstSave) {
        firstSave = false;
        await new Promise<void>((resolve) => { releaseFirstSave = resolve; });
      }
      return save(record);
    });

    const first = service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: null,
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
    });
    await vi.waitFor(() => expect(applied).toEqual([["SceneChanged"]]));
    const second = service.updateStreamerBotSubscriptions(bot.provider.provider.id, {
      twitchBroadcasterId: null,
      externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted"] }]
    });

    await Promise.resolve();
    expect(applied).toEqual([["SceneChanged"]]);
    releaseFirstSave();
    await Promise.all([first, second]);

    expect(applied).toEqual([["SceneChanged"], ["RecordingStarted"]]);
    await expect(service.getProvider(bot.provider.provider.id)).resolves.toMatchObject({
      configuration: {
        externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted"] }]
      }
    });
  });
});

function createSubscriptionService(
  repository: SqliteProviderRegistrationRepository,
  secrets: InMemorySecrets,
  runtime: {
  getCatalog(providerId: string): Promise<Record<string, readonly string[]>>;
  replaceExternalSubscriptions(
    providerId: string,
    next: readonly StreamerBotSubscriptionSelection[],
    broadcasterId: string | null
  ): Promise<{ rollback(): Promise<void> }>;
  }
): ProviderManagementService {
  let id = 0;
  return new ProviderManagementService({
    repository,
    adapters: new Map([
      ["streamerbot", successfulAdapter("active")],
      ["speakerbot", successfulAdapter(null)]
    ]),
    secretStore: secrets,
    getActivationImpact: async () => emptyImpact,
    getUsedByAlertCount: async () => 0,
    streamerBotSubscriptions: runtime,
    getVerifiedTwitchBroadcasterId: async () => "broadcaster-1",
    generateId: () => `provider-subscriptions-${++id}`,
    generateReferenceId: () => "provider-ref-1",
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
}

function runtimeMutation(rollback: () => Promise<void> = async () => {}) {
  return { rollback };
}

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
