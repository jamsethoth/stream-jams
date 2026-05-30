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
      createdAt: "2026-05-30T10:00:00.000Z"
    };

    const created = await repository.create(input);

    expect(created).toEqual({ ...input, revokedAt: null });
    await expect(repository.findById("overlay-key-1")).resolves.toEqual(created);
    expect(JSON.stringify(database.connection.prepare("SELECT * FROM overlay_keys").all())).not.toContain("ovl_");
  });

  it("finds candidates by overlay id and updates revocation state", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayAccessKeyRepository(database.connection);
    const first = await repository.create({
      id: "overlay-key-1",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      keyHash: "sha256:first",
      createdAt: "2026-05-30T10:00:00.000Z"
    });
    await repository.create({
      id: "overlay-key-2",
      overlayId: "secondary",
      moduleId: null,
      purpose: "live",
      scope: "unified",
      keyHash: "sha256:second",
      createdAt: "2026-05-30T10:01:00.000Z"
    });

    await expect(repository.findCandidates("default")).resolves.toEqual([first]);

    const revoked = await repository.update({
      ...first,
      revokedAt: "2026-05-30T10:05:00.000Z"
    });

    expect(revoked?.revokedAt).toBe("2026-05-30T10:05:00.000Z");
    await expect(repository.findById("overlay-key-1")).resolves.toEqual(revoked);
    await expect(repository.update({ ...first, id: "missing" })).resolves.toBeNull();
  });
});
