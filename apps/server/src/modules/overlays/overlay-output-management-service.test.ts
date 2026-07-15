import {
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  createDefaultOverlayModuleRegistry
} from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { describe, expect, it } from "vitest";
import { InMemoryOverlayAccessKeyRepository, LocalOverlayAccessService } from "./overlay-access-service.js";
import {
  OverlayOutputManagementService,
  createOverlayRouteKeySecretRef
} from "./overlay-output-management-service.js";

describe("OverlayOutputManagementService", () => {
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
      { id: "module:alerts:landscape:test", targetProfileId: "landscape", purpose: "test" },
      { id: "module:alerts:vertical:live", targetProfileId: "vertical", purpose: "live" },
      { id: "module:alerts:vertical:test", targetProfileId: "vertical", purpose: "test" }
    ]);
  });

  it("creates profile-scoped URLs while preserving profile-less legacy URLs", async () => {
    const { service } = createService(["ovl_profile", "ovl_legacy"]);

    const profile = await service.createKey(
      {
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical"
      },
      "http://127.0.0.1:39187"
    );
    const legacy = await service.createKey(
      {
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module"
      },
      "http://127.0.0.1:39187"
    );

    expect(profile.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_profile?profile=vertical");
    expect(legacy.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_legacy");
  });

  it("creates, recovers, and regenerates active output URLs without storing raw keys in records", async () => {
    const { service, repository, secrets } = createService(["ovl_first", "ovl_second", "ovl_unified", "ovl_third"]);
    const input = {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live" as const,
      scope: "module" as const
    };

    const created = await service.createKey(input, "http://127.0.0.1:39187");
    await service.createKey(input, "http://127.0.0.1:39187");
    await service.createKey(
      {
        overlayId: "default",
        moduleId: null,
        purpose: "live",
        scope: "unified"
      },
      "http://127.0.0.1:39187"
    );
    const listed = await service.listOutputs("http://127.0.0.1:39187");
    const regenerated = await service.regenerateKey(input, "http://127.0.0.1:39187");

    expect(created.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first");
    expect(listed.find((output) => output.id === "module:alerts:live")).toMatchObject({
      keyId: "key-1",
      copyableUrlStatus: "available",
      url: created.url
    });
    expect(regenerated.url).toBe("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_third");
    expect(
      repository.records.filter(
        (record) => record.scope === "module" && record.moduleId === "alerts" && record.revokedAt === null
      )
    ).toHaveLength(1);
    expect(
      repository.records.filter((record) => record.scope === "unified" && record.revokedAt === null)
    ).toHaveLength(1);
    expect(JSON.stringify(repository.records)).not.toContain("ovl_first");
    expect(secrets.values.get("overlay:route-key:key-4")).toBe("ovl_third");
  });

  it("marks legacy hash-only keys as requiring regeneration", async () => {
    const { service, repository } = createService([]);
    await repository.create({
      id: "legacy",
      overlayId: "default",
      moduleId: null,
      purpose: "test",
      scope: "unified",
      keyHash: "sha256:legacy",
      routeKeySecretRef: null,
      createdAt: "2026-06-16T12:00:00.000Z"
    });

    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({
        id: "unified:test",
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
      moduleId: null,
      purpose: "test",
      scope: "unified",
      keyHash: "sha256:missing-secret",
      routeKeySecretRef: createOverlayRouteKeySecretRef("missing-secret"),
      createdAt: "2026-06-16T12:00:00.000Z"
    });

    await expect(service.listOutputs("http://127.0.0.1:39187")).resolves.toContainEqual(
      expect.objectContaining({
        id: "unified:test",
        keyId: "missing-secret",
        url: null,
        copyableUrlStatus: "regenerate-required"
      })
    );
  });
});

function createService(rawKeys: string[]) {
  let id = 0;
  let rawKeyIndex = 0;
  const registry = createDefaultOverlayModuleRegistry();
  const repository = new InMemoryOverlayAccessKeyRepository();
  const secrets = new InMemorySecretStore((ref) => `${ref.namespace}:${ref.name}:${ref.accountId}`);
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

  return {
    repository,
    secrets,
    service: new OverlayOutputManagementService({
      overlayAccessService: accessService,
      overlayKeyRepository: repository,
      overlayModuleRegistry: registry,
      overlayModuleConfigService: new DefaultOverlayModuleConfigService({
        registry,
        repository: new InMemoryOverlayModuleConfigRepository(),
        clock: () => new Date("2026-06-16T12:00:00.000Z")
      }),
      secretStore: secrets
    })
  };
}
