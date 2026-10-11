import type { OverlayAccessKeyCreateRecordInput } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteOverlayAccessKeyRepository } from "./sqlite-overlay-access-key-repository.js";

describe("SqliteOverlayAccessKeyRepository", () => {
  it("creates and finds overlay key records without raw key material", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayAccessKeyRepository(database.connection);
    const input: OverlayAccessKeyCreateRecordInput = {
      id: "overlay-key-1",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      keyHash: "sha256:abc123",
      routeKeySecretRef: {
        namespace: "overlay",
        accountId: "overlay-key-1",
        name: "route-key"
      },
      createdAt: "2026-05-30T10:00:00.000Z"
    };

    const created = await repository.create(input);

    expect(created).toEqual({ ...input, targetProfileId: null, revokedAt: null });
    await expect(repository.findById("overlay-key-1")).resolves.toEqual(created);
    expect(JSON.stringify(database.connection.prepare("SELECT * FROM overlay_keys").all())).not.toContain("ovl_");
  });

  it("finds an exact hash and output history without loading overlay-wide candidates", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayAccessKeyRepository(database.connection);
    const first = await repository.create({
      id: "overlay-key-1",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      keyHash: "sha256:first",
      routeKeySecretRef: null,
      createdAt: "2026-05-30T10:00:00.000Z"
    });
    await repository.create({
      id: "overlay-key-2",
      overlayId: "secondary",
      moduleId: null,
      purpose: "live",
      scope: "unified",
      keyHash: "sha256:second",
      routeKeySecretRef: null,
      createdAt: "2026-05-30T10:01:00.000Z"
    });

    await expect(repository.findByHash("sha256:first")).resolves.toEqual(first);
    await expect(repository.findByHash("sha256:missing")).resolves.toBeNull();
    await expect(
      repository.hasOutput({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module"
      })
    ).resolves.toBe(true);
    await expect(
      repository.hasOutput({
        overlayId: "default",
        moduleId: "music",
        purpose: "test",
        scope: "module"
      })
    ).resolves.toBe(false);
    await expect(
      repository.findByOutput({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "test",
        scope: "module"
      })
    ).resolves.toEqual([first]);

    const revoked = await repository.update({
      ...first,
      revokedAt: "2026-05-30T10:05:00.000Z"
    });

    expect(revoked?.revokedAt).toBe("2026-05-30T10:05:00.000Z");
    await expect(repository.findById("overlay-key-1")).resolves.toEqual(revoked);
    await expect(repository.update({ ...first, id: "missing" })).resolves.toBeNull();
  });

  it("persists and queries target-profile keys independently from legacy keys", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayAccessKeyRepository(database.connection);
    const landscape = await repository.create({
      id: "overlay-key-landscape",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape",
      keyHash: "sha256:landscape",
      routeKeySecretRef: null,
      createdAt: "2026-07-15T10:00:00.000Z"
    });
    await repository.create({
      id: "overlay-key-vertical",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "vertical",
      keyHash: "sha256:vertical",
      routeKeySecretRef: null,
      createdAt: "2026-07-15T10:01:00.000Z"
    });

    await expect(
      repository.findByOutput({
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        targetProfileId: "landscape"
      })
    ).resolves.toEqual([landscape]);
    await expect(repository.findById(landscape.id)).resolves.toMatchObject({ targetProfileId: "landscape" });
  });

  it("resolves only active recipient identities synchronously and clears secret refs only for revoked keys", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayAccessKeyRepository(database.connection);
    const base = { overlayId: "default", moduleId: "music", purpose: "live", scope: "module", keyHash: "sha256:a", createdAt: "2026-05-30T10:00:00.000Z" } as const;
    await repository.create({ ...base, id: "active", targetProfileId: "landscape", routeKeySecretRef: { namespace: "overlay", accountId: "active", name: "route-key" } });
    const revoked = await repository.create({ ...base, id: "revoked", keyHash: "sha256:b", routeKeySecretRef: { namespace: "overlay", accountId: "revoked", name: "route-key" } });
    await repository.update({ ...revoked, revokedAt: "2026-05-30T11:00:00.000Z" });
    expect(repository.findActiveRecipientIdentity("active")).toEqual({ overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: "landscape" });
    expect(repository.findActiveRecipientIdentity("revoked")).toBeNull();
    expect(repository.findActiveRecipientIdentity("missing")).toBeNull();
    expect(repository.listRevokedSecretReferences()).toEqual([{ id: "revoked", secretRefJson: JSON.stringify({ namespace: "overlay", accountId: "revoked", name: "route-key" }) }]);
    repository.clearRevokedSecretReference("active");
    repository.clearRevokedSecretReference("revoked");
    expect((await repository.findById("active"))?.routeKeySecretRef).not.toBeNull();
    expect((await repository.findById("revoked"))?.routeKeySecretRef).toBeNull();
  });
});
