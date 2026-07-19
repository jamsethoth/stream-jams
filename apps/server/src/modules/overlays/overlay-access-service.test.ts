import type { CreateOverlayKeyInput, OverlayAccessKeyRepository } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { InMemoryOverlayAccessKeyRepository, LocalOverlayAccessService } from "./overlay-access-service.js";

const now = new Date("2026-05-29T12:00:00.000Z");

describe("LocalOverlayAccessService", () => {
  it("creates live and test overlay keys with hash-only storage", async () => {
    const repository = new InMemoryOverlayAccessKeyRepository();
    const service = createService(repository, ["ovl_liveRawKey", "ovl_testRawKey"]);

    const live = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const test = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module"
    });

    expect(live.rawKey).toBe("ovl_liveRawKey");
    expect(test.rawKey).toBe("ovl_testRawKey");
    expect(live.record).toMatchObject({
      id: "key-1",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      createdAt: "2026-05-29T12:00:00.000Z",
      revokedAt: null
    });
    expect(repository.records).toHaveLength(2);
    expect(repository.records.map((record) => record.keyHash)).toEqual([
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    ]);
    expect(JSON.stringify(repository.records)).not.toContain("ovl_liveRawKey");
    expect(JSON.stringify(repository.records)).not.toContain("ovl_testRawKey");
  });

  it("authorizes only matching output metadata and raw route key", async () => {
    const service = createService(new InMemoryOverlayAccessKeyRepository(), ["ovl_moduleRawKey", "ovl_unifiedRawKey"]);
    const moduleKey = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module"
    });
    const unifiedKey = await service.createKey({
      overlayId: "default",
      moduleId: null,
      purpose: "test",
      scope: "unified"
    });

    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module",
        rawKey: moduleKey.rawKey
      })
    ).resolves.toEqual({
      authorized: true,
      record: moduleKey.record
    });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        rawKey: moduleKey.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "purpose-mismatch" });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: null,
        purpose: "test",
        scope: "unified",
        rawKey: moduleKey.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "scope-mismatch" });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module",
        rawKey: unifiedKey.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "scope-mismatch" });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "music",
        purpose: "test",
        scope: "module",
        rawKey: moduleKey.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "module-mismatch" });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module",
        rawKey: "ovl_wrongRawKey"
      })
    ).resolves.toEqual({ authorized: false, reason: "key-mismatch" });
  });

  it("scopes module keys independently by target profile while preserving legacy keys", async () => {
    const repository = new InMemoryOverlayAccessKeyRepository();
    const service = createService(repository, ["ovl_landscape", "ovl_vertical", "ovl_legacy"]);
    const landscape = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape"
    });
    const vertical = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "vertical"
    });
    const legacy = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });

    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical",
        rawKey: landscape.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "profile-mismatch" });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical",
        rawKey: vertical.rawKey
      })
    ).resolves.toEqual({ authorized: true, record: vertical.record });
    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        rawKey: legacy.rawKey
      })
    ).resolves.toEqual({ authorized: true, record: legacy.record });
  });

  it("denies revoked keys even when route metadata and raw key match", async () => {
    const repository = new InMemoryOverlayAccessKeyRepository();
    const service = createService(repository, ["ovl_revokedRawKey"]);
    const created = await service.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });

    await service.revokeKey(created.record.id);

    await expect(
      service.verifyRouteAccess({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        rawKey: created.rawKey
      })
    ).resolves.toEqual({ authorized: false, reason: "revoked" });
  });
});

function createService(repository: InMemoryOverlayAccessKeyRepository, rawKeys: string[]): LocalOverlayAccessService {
  let id = 0;
  let rawKeyIndex = 0;
  return new LocalOverlayAccessService({
    repository,
    clock: () => now,
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
    createRouteKeySecretRef: (keyId) => ({
      namespace: "overlay",
      accountId: keyId,
      name: "route-key"
    })
  });
}

class UnusedOverlayRepositoryContractCheck implements OverlayAccessKeyRepository {
  readonly records = [];

  async create(
    input: CreateOverlayKeyInput & {
      readonly id: string;
      readonly keyHash: string;
      readonly routeKeySecretRef: null;
      readonly createdAt: string;
    }
  ) {
    return {
      ...input,
      revokedAt: null
    };
  }

  async findById() {
    return null;
  }

  async findCandidates() {
    return [];
  }

  async findByOutput() {
    return [];
  }

  async update() {
    return null;
  }
}

void UnusedOverlayRepositoryContractCheck;
