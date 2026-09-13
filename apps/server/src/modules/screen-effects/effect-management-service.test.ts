import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import {
  EffectBindingUnavailableError,
  EffectDefinitionConflictError,
  EffectDefinitionNotFoundError,
  EffectLiveImpactConfirmationRequiredError,
  EffectManagementService,
  EffectTestDisabledError
} from "./effect-management-service.js";

function document(id = "effect-one", enabled = false): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id, name: "Effect one", defaultVariantId: `${id}-default` });
  return screenEffectDocumentSchema.parse({
    ...draft,
    enabled,
    bindings: [{
      id: `${id}-binding`,
      kind: "twitch-reward",
      broadcasterId: "broadcaster-one",
      rewardId: "reward-one"
    }],
    variants: [{
      ...draft.variants[0],
      sound: { assetId: "tone-one", volume: 0.5 },
      outputs: { browserSource: true, deviceRouteIds: [] }
    }]
  });
}

function fixture(initial: readonly ScreenEffectDocument[] = []) {
  const values = new Map(initial.map((item) => [item.id, structuredClone(item)]));
  const repository: ScreenEffectRepository = {
    list: vi.fn(async () => [...values.values()].map((item) => structuredClone(item))),
    find: vi.fn(async (id) => values.has(id) ? structuredClone(values.get(id)!) : null),
    save: vi.fn(async (item) => { values.set(item.id, structuredClone(item)); }),
    remove: vi.fn(async (id) => { values.delete(id); })
  };
  const testEffectVariant = vi.fn(async (effectId: string, variantId: string) => ({
    effectId,
    occurrenceId: `occurrence-${variantId}`,
    status: "queued" as const
  }));
  const service = new EffectManagementService({
    repository,
    testEffectVariant,
    isTwitchRewardAvailable: async (broadcasterId, rewardId) => broadcasterId === "broadcaster-one" && rewardId === "reward-one",
    isStreamerBotSelectionConfigured: async () => false
  });
  return { repository, service, testEffectVariant };
}

describe("EffectManagementService", () => {
  it("runs definition writes through the configured mutation boundary", async () => {
    const { repository } = fixture();
    const mutations: string[] = [];
    const service = new EffectManagementService({
      repository,
      testEffectVariant: async () => ({ effectId: "effect-one", status: "queued", occurrenceId: "occurrence-one" }),
      async runMutation(work) {
        mutations.push("start");
        const result = await work();
        mutations.push("end");
        return result;
      }
    });

    const candidate = document();
    await service.create(candidate);
    await service.update(candidate.id, { ...candidate, name: "Updated" }, false);
    await service.remove(candidate.id);

    expect(mutations).toEqual(["start", "end", "start", "end", "start", "end"]);
  });

  it("creates disabled documents and rejects conflicting IDs", async () => {
    const { service } = fixture();
    const candidate = document();

    await expect(service.create(candidate)).resolves.toEqual(candidate);
    await expect(service.create(candidate)).rejects.toBeInstanceOf(EffectDefinitionConflictError);
  });

  it("requires confirmation before enabling or changing a live effect", async () => {
    const existing = document();
    const { repository, service } = fixture([existing]);
    const enabled = { ...existing, enabled: true };

    await expect(service.update(existing.id, enabled, false)).rejects.toBeInstanceOf(
      EffectLiveImpactConfirmationRequiredError
    );
    expect(repository.save).not.toHaveBeenCalled();
    await expect(service.update(existing.id, enabled, true)).resolves.toEqual(enabled);

    const renamed = { ...enabled, name: "Updated live effect" };
    await expect(service.update(existing.id, renamed, false)).rejects.toBeInstanceOf(
      EffectLiveImpactConfirmationRequiredError
    );
  });

  it("rejects unresolved configured bindings before persistence", async () => {
    const candidate = {
      ...document(),
      bindings: [{
        id: "missing-binding",
        kind: "streamerbot-event" as const,
        providerId: "provider-one",
        sourceKey: "OBS",
        eventType: "SceneChanged"
      }]
    };
    const { repository, service } = fixture();

    await expect(service.create(candidate)).rejects.toBeInstanceOf(EffectBindingUnavailableError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("tests one exact saved enabled variant and rejects disabled effects", async () => {
    const enabled = document("effect-enabled", true);
    const disabled = document("effect-disabled", false);
    const { service, testEffectVariant } = fixture([enabled, disabled]);

    await expect(service.test(enabled.id, enabled.variants[0]!.id, true)).resolves.toMatchObject({
      status: "queued",
      occurrenceId: `occurrence-${enabled.variants[0]!.id}`
    });
    expect(testEffectVariant).toHaveBeenCalledWith(enabled.id, enabled.variants[0]!.id);
    await expect(service.test(disabled.id, disabled.variants[0]!.id, true)).rejects.toBeInstanceOf(
      EffectTestDisabledError
    );
  });

  it("requires explicit live-impact confirmation and reports missing documents", async () => {
    const enabled = document("effect-enabled", true);
    const { service } = fixture([enabled]);

    await expect(service.test(enabled.id, enabled.variants[0]!.id, false)).rejects.toBeInstanceOf(
      EffectLiveImpactConfirmationRequiredError
    );
    await expect(service.get("missing")).rejects.toBeInstanceOf(EffectDefinitionNotFoundError);
    await expect(service.remove("missing")).rejects.toBeInstanceOf(EffectDefinitionNotFoundError);
  });
});
