import {
  DefaultOverlayCompositionService,
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  createDefaultOverlayModuleRegistry,
  type SecretRef
} from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { describe, expect, it } from "vitest";
import { InMemoryOverlayAccessKeyRepository, LocalOverlayAccessService } from "./overlay-access-service.js";
import {
  OverlayOutputManagementService,
  createOverlayRouteKeySecretRef
} from "./overlay-output-management-service.js";

describe("OverlayOutputManagementService", () => {
  it("offers exactly eight ordinary sources and cannot mint retired or legacy choices", async () => {
    const { service, repository, secrets } = createService(["ovl_should_not_be_generated"]);
    const origin = "http://127.0.0.1:39187";
    for (const input of [
      { moduleId: null, scope: "unified" as const, purpose: "live" as const, targetProfileId: null },
      { moduleId: "music", scope: "module" as const, purpose: "test" as const, targetProfileId: "landscape" as const },
      { moduleId: "alerts", scope: "module" as const, purpose: "live" as const, targetProfileId: null },
      { moduleId: "videos", scope: "module" as const, purpose: "live" as const, targetProfileId: "vertical" as const }
    ]) {
      await expect(service.createKey({ overlayId: "default", ...input }, origin)).rejects.toThrow();
      await expect(service.regenerateKey({ overlayId: "default", ...input }, origin)).rejects.toThrow();
    }
    expect(repository.records).toEqual([]);
    expect(secrets.values.size).toBe(0);
    const outputs = await service.listOutputs(origin);
    expect(outputs).toHaveLength(8);
    expect(outputs.every(output => output.scope === "module" && output.purpose === "live")).toBe(true);
  });
  it("advertises the same authoritative canvas while empty and disabled after save", async () => {
    const { service, configService, compositions } = createService([]);
    const origin = "http://127.0.0.1:39187";
    await configService.saveModuleConfig({ moduleId: "alerts", enabled: false, config: { canvas: { width: 800, height: 600 } } });
    const output = (await service.listOutputs(origin)).find(output => output.moduleId === "alerts" && output.targetProfileId === "landscape" && output.purpose === "live")!;
    const composition = await compositions.resolveModuleOutput({ moduleId: "alerts", overlayId: "default", purpose: "live", targetProfileId: "landscape" });
    expect(output.enabled).toBe(false);
    expect(composition.modules).toEqual([]);
    expect(output.canvas).toEqual(composition.canvas);
    expect(output.canvas).toMatchObject({ width: 1920, height: 1080, configRevision: 1 });
    const again = await compositions.resolveModuleOutput({ moduleId: "alerts", overlayId: "default", purpose: "live", targetProfileId: "landscape" });
    expect(again.canvas).toBe(composition.canvas);
  });

  it("lists ordinary Music outputs for Landscape and Vertical", async () => {
    const { service } = createService([]);
    const outputs = await service.listOutputs("http://127.0.0.1:39187");
    expect(outputs.filter(output => output.moduleId === "music").map(output => [output.targetProfileId, output.purpose])).toEqual([
      ["landscape", "live"], ["vertical", "live"]
    ]);
  });
  it("lists only the ordinary Videos module output", async () => {
    const { service } = createService([]);
    const outputs = await service.listOutputs("http://127.0.0.1:39187");
    expect(outputs.filter(output => output.moduleId === "video-shoutout")).toEqual([]);
    expect(outputs.filter(output => output.moduleId === "videos")).toEqual([
      expect.objectContaining({ id: "module:videos:live", scope: "module", targetProfileId: null, purpose: "live", enabled: true, url: null, copyableUrlStatus: "create-required" })
    ]);
  });
  it("creates a Videos URL on the existing module route family", async () => {
    const { service } = createService(["ovl_videosLive"]);
    const created = await service.createKey({ overlayId: "default", scope: "module", moduleId: "videos", purpose: "live", targetProfileId: null }, "http://127.0.0.1:39187");
    expect(created.url).toBe("http://127.0.0.1:39187/overlay/modules/videos/live/ovl_videosLive");
  });
  it("cannot recreate a retired Videos test key", async () => {
    const { service } = createService([]);
    const retired = { overlayId: "default", scope: "module" as const, moduleId: "videos", purpose: "test" as const, targetProfileId: null };
    await expect(service.createKey(retired, "http://127.0.0.1:39187")).rejects.toThrow();
    await expect(service.regenerateKey(retired, "http://127.0.0.1:39187")).rejects.toThrow();
    expect((await service.listOutputs("http://127.0.0.1:39187")).some(output => output.moduleId === "videos" && output.purpose === "test")).toBe(false);
  });
  it("lists independent Alerts outputs for both target profiles and purposes", async () => {
    const { service } = createService([]);

    const outputs = await service.listOutputs("http://127.0.0.1:39187");

    expect(
      outputs
        .filter(
          (output) =>
            output.scope === "module" && output.moduleId === "alerts" && output.targetProfileId !== null
        )
        .map((output) => ({ id: output.id, targetProfileId: output.targetProfileId, purpose: output.purpose }))
    ).toEqual([
      { id: "module:alerts:landscape:live", targetProfileId: "landscape", purpose: "live" },
      { id: "module:alerts:vertical:live", targetProfileId: "vertical", purpose: "live" },
    ]);
  });

  it("lists independent Timers outputs for both target profiles and purposes", async () => {
    const { service } = createService([]);

    const outputs = await service.listOutputs("http://127.0.0.1:39187");

    expect(
      outputs
        .filter(
          (output) =>
            output.scope === "module" && output.moduleId === "timers" && output.targetProfileId !== null
        )
        .map((output) => ({ id: output.id, targetProfileId: output.targetProfileId, purpose: output.purpose }))
    ).toEqual([
      { id: "module:timers:landscape:live", targetProfileId: "landscape", purpose: "live" },
      { id: "module:timers:vertical:live", targetProfileId: "vertical", purpose: "live" },
    ]);
  });

  it("preserves hidden legacy identities for explicit revocation without minting replacements", async () => {
    const { service, repository } = createService(["ovl_profile"]);
    const profile = await service.createKey({ overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: "vertical" }, "http://127.0.0.1:39187");
    await repository.create({ id: "legacy", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: null, keyHash: "sha256:legacy", routeKeySecretRef: null, createdAt: "2026-06-16T12:00:00.000Z" });
    expect(profile.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_profile?profile=vertical");
    expect(await service.listLegacyKeys()).toEqual([{ keyId: "legacy", moduleId: "alerts", createdAt: "2026-06-16T12:00:00.000Z" }]);
    expect((await service.listOutputs("http://127.0.0.1:39187")).some(output => output.keyId === "legacy")).toBe(false);
    expect((await service.revokeKey("legacy"))?.revokedAt).not.toBeNull();
    expect(await service.listLegacyKeys()).toEqual([]);
  });

  it("creates, recovers, and regenerates active output URLs without storing raw keys in records", async () => {
    const { service, repository, secrets } = createService(["ovl_first", "ovl_second", "ovl_unified", "ovl_third"]);
    const input = {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live" as const,
      scope: "module" as const,
      targetProfileId: "landscape" as const
    };

    const created = await service.createKey(input, "http://127.0.0.1:39187");
    await service.createKey(input, "http://127.0.0.1:39187");
    await service.createKey(
      {
        overlayId: "default",
        moduleId: "music",
        purpose: "live",
        scope: "module",
        targetProfileId: "landscape"
      },
      "http://127.0.0.1:39187"
    );
    const listed = await service.listOutputs("http://127.0.0.1:39187");
    const regenerated = await service.regenerateKey(input, "http://127.0.0.1:39187");

    expect(created.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first?profile=landscape");
    expect(listed.find((output) => output.id === "module:alerts:landscape:live")).toMatchObject({
      keyId: "key-1",
      copyableUrlStatus: "available",
      url: created.url
    });
    expect(regenerated.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_third?profile=landscape");
    expect(
      repository.records.filter(
        (record) => record.scope === "module" && record.moduleId === "alerts" && record.revokedAt === null
      )
    ).toHaveLength(1);
    expect(
      repository.records.filter((record) => record.moduleId === "music" && record.revokedAt === null)
    ).toHaveLength(1);
    expect(JSON.stringify(repository.records)).not.toContain("ovl_first");
    expect(secrets.values.get("overlay:route-key:key-4")).toBe("ovl_third");
  });

  it("marks legacy hash-only keys as requiring regeneration", async () => {
    const { service, repository } = createService([]);
    await repository.create({
      id: "legacy",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape",
      keyHash: "sha256:legacy",
      routeKeySecretRef: null,
      createdAt: "2026-06-16T12:00:00.000Z"
    });

    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({
        id: "module:alerts:landscape:live",
        keyId: "legacy",
        url: null,
        copyableUrlStatus: "regenerate-required"
      })
    );
  });

  it("marks missing recoverable secrets as requiring regeneration", async () => {
    const { service, repository } = createService([]);
    await repository.create({
      id: "missing-secret",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape",
      keyHash: "sha256:missing-secret",
      routeKeySecretRef: createOverlayRouteKeySecretRef("missing-secret"),
      createdAt: "2026-06-16T12:00:00.000Z"
    });

    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({
        id: "module:alerts:landscape:live",
        keyId: "missing-secret",
        url: null,
        copyableUrlStatus: "regenerate-required"
      })
    );
  });

  it("leaves the current key usable when replacement creation fails", async () => {
    const { service, repository, secrets } = createService(["ovl_current"]);
    const input = {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live" as const,
      scope: "module" as const,
      targetProfileId: "landscape" as const
    };
    const current = await service.createKey(input, "http://127.0.0.1:39187");

    await expect(service.regenerateKey(input, "http://127.0.0.1:39187")).rejects.toThrow("Missing raw key fixture");

    expect(repository.records.filter((record) => record.revokedAt === null).map((record) => record.id)).toEqual(["key-1"]);
    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({ keyId: "key-1", url: current.url, copyableUrlStatus: "available" })
    );
    expect(secrets.values.get("overlay:route-key:key-1")).toBe("ovl_current");
  });

  it("revokes an unstored replacement and leaves the current key usable when secret storage fails", async () => {
    const secrets = new FailAfterWriteSecretStore("key-2");
    const retired: string[] = [];
    const { service, repository } = createService(["ovl_current", "ovl_replacement"], secrets, { onKeyRevoked: id => retired.push(id) });
    const input = {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live" as const,
      scope: "module" as const,
      targetProfileId: "landscape" as const
    };
    const current = await service.createKey(input, "http://127.0.0.1:39187");

    await expect(service.regenerateKey(input, "http://127.0.0.1:39187")).rejects.toThrow("secret storage failed");

    expect(repository.records.find((record) => record.id === "key-1")?.revokedAt).toBeNull();
    expect(repository.records.find((record) => record.id === "key-2")?.revokedAt).not.toBeNull();
    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({ keyId: "key-1", url: current.url, copyableUrlStatus: "available" })
    );
    expect(secrets.values.get("overlay:route-key:key-1")).toBe("ovl_current");
    expect(secrets.values.has("overlay:route-key:key-2")).toBe(false);
    expect(retired).toEqual(["key-2"]);
  });

  it("revokes authority and registered recipients before failed legacy secret cleanup without touching ordinary keys", async () => {
    const secrets = new InMemorySecretStore();
    let failed = 0;
    const retired: string[] = [];
    const { service, repository } = createService(["ovl_ordinary"], secrets, {
      onKeyRevoked: id => { expect(repository.records.find(row => row.id === id)?.revokedAt).not.toBeNull(); retired.push(id); },
      onCleanupFailure: async () => { failed += 1; }
    });
    await service.createKey({ overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: "vertical" }, "http://127.0.0.1");
    const ordinary = structuredClone(repository.records[0]);
    const legacyRef = createOverlayRouteKeySecretRef("legacy");
    await repository.create({ id: "legacy", overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: null,
      keyHash: "sha256:legacy", routeKeySecretRef: legacyRef, createdAt: "2026-06-16T12:00:00.000Z" });
    await secrets.setSecret(legacyRef, "old-key");
    secrets.deleteSecret = async ref => { expect(ref).toEqual(legacyRef); expect(retired).toEqual(["legacy"]); throw new Error("keyring unavailable"); };
    expect((await service.revokeKey("legacy"))?.revokedAt).not.toBeNull();
    expect(failed).toBe(1);
    expect(repository.records[0]).toEqual(ordinary);
    expect(await service.listLegacyKeys()).toEqual([]);
    expect((await service.listOutputs("http://127.0.0.1")).find(output => output.keyId === ordinary?.id)?.url).toContain("ovl_ordinary");
  });

  it("treats re-revoking an already-revoked key as a no-op without re-firing recipient or secret cleanup", async () => {
    const secrets = new InMemorySecretStore();
    const revokedEvents: string[] = [];
    const { service, repository } = createService([], secrets, { onKeyRevoked: id => { revokedEvents.push(id); } });
    const legacyRef = createOverlayRouteKeySecretRef("legacy");
    await repository.create({ id: "legacy", overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: null,
      keyHash: "sha256:legacy", routeKeySecretRef: legacyRef, createdAt: "2026-06-16T12:00:00.000Z" });
    const deleted: unknown[] = [];
    secrets.deleteSecret = async ref => { deleted.push(ref); };
    const first = await service.revokeKey("legacy");
    const second = await service.revokeKey("legacy");
    expect(second?.revokedAt).toBe(first?.revokedAt);
    expect(revokedEvents).toEqual(["legacy"]);
    expect(deleted).toEqual([legacyRef]);
    expect(await service.revokeKey("missing")).toBeNull();
    expect(revokedEvents).toEqual(["legacy"]);
  });
});

function createService(
  rawKeys: string[],
  secrets = new InMemorySecretStore((ref) => `${ref.namespace}:${ref.name}:${ref.accountId}`),
  callbacks: Pick<import("./overlay-output-management-service.js").OverlayOutputManagementServiceOptions, "onKeyRevoked" | "onCleanupFailure"> = {}
) {
  let id = 0;
  let rawKeyIndex = 0;
  const registry = createDefaultOverlayModuleRegistry();
  const repository = new InMemoryOverlayAccessKeyRepository();
  const accessService = new LocalOverlayAccessService({
    repository,
    clock: () => new Date("2026-06-16T12:00:00.000Z"),
    generateId: () => {
      id += 1;
      return `key-${id}`;
    },
    generateRawKey: () => {
      const rawKey = rawKeys[rawKeyIndex];
      rawKeyIndex += 1;
      if (rawKey === undefined) {
        throw new Error("Missing raw key fixture");
      }
      return rawKey;
    },
    createRouteKeySecretRef: createOverlayRouteKeySecretRef
  });

  const configService = new DefaultOverlayModuleConfigService({ registry, repository: new InMemoryOverlayModuleConfigRepository(), clock: () => new Date("2026-06-16T12:00:00.000Z") });
  const compositions = new DefaultOverlayCompositionService({ configService, runtime: { getModuleSnapshot: async request => ({ moduleId: request.moduleId, enabled: true, instructions: [] }) } });
  return {
    configService, compositions,
    repository,
    secrets,
    service: new OverlayOutputManagementService({
      ...callbacks,
      overlayAccessService: accessService,
      overlayKeyRepository: repository,
      overlayModuleRegistry: registry,
      overlayModuleConfigService: configService,
      getCanvas: (moduleId, targetProfileId) => compositions.getModuleOutputCanvas({ moduleId, ...(targetProfileId === undefined ? {} : { targetProfileId }) }),
      secretStore: secrets,
      listLegacyKeys: async () => repository.records
    })
  };
}

class FailAfterWriteSecretStore extends InMemorySecretStore {
  constructor(private readonly failingAccountId: string) {
    super((ref) => `${ref.namespace}:${ref.name}:${ref.accountId}`);
  }

  override async setSecret(ref: SecretRef, value: string): Promise<void> {
    await super.setSecret(ref, value);
    if (ref.accountId === this.failingAccountId) {
      throw new Error("secret storage failed");
    }
  }
}
