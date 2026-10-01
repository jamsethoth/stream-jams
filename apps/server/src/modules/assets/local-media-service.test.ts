import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAssetRepository } from "./sqlite-asset-repository.js";
import { LocalAssetStore } from "./local-asset-store.js";
import { SqliteAssetRetirementRepository } from "./sqlite-asset-retirement-repository.js";
import { LocalMediaService } from "./local-media-service.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-media-owners-"));
  const database = createInMemoryStreamJamsDatabase();
  const assets = new SqliteAssetRepository(database.connection);
  const store = new LocalAssetStore({ assetDirectory: directory });
  const retirements = new SqliteAssetRetirementRepository(database.connection);
  const media = new LocalMediaService({ assets, store, retirements });
  const original = { id: "asset", originalFileName: "media.webm", mediaType: "video" as const, mimeType: "video/webm", sizeBytes: 3, checksum: `sha256:${createHash("sha256").update("old").digest("hex")}`, storagePath: "old.webm", durationMs: 1000 };
  await writeFile(join(directory, original.storagePath), "old");
  await assets.save(original);
  return { directory, database, assets, store, retirements, media, original, async close() { await media.close(); database.close(); await rm(directory, { recursive: true, force: true }); } };
}

it("retains admitted bytes and duration until the last owner releases them", async () => {
  const f = await fixture();
  try {
    const first = await f.media.acquire("first", ["asset"]);
    await f.media.acquire("second", ["asset"]);
    const replacement = { ...f.original, storagePath: "new.webm", durationMs: 2000 };
    await f.media.mutate(async () => { await writeFile(join(f.directory, "new.webm"), "new"); await f.assets.save(replacement); });
    expect(first.get("asset")).toEqual(f.original);
    expect((await f.media.acquire("third", ["asset"])).get("asset")?.durationMs).toBe(2000);
    await f.media.release("first");
    expect(await f.store.read("old.webm")).toEqual(Buffer.from("old"));
    await f.media.release("second");
    expect(await f.store.inspect("old.webm")).toBe("missing");
    expect(await f.store.inspect("new.webm")).toBe("available");
    expect(f.retirements.list()).toEqual([]);
  } finally { await f.close(); }
});

it("reconciles committed replacement retirement after restart without sweeping unrelated files", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.directory, "unrelated"), "keep");
    await writeFile(join(f.directory, "new.webm"), "new");
    await f.assets.save({ ...f.original, storagePath: "new.webm" });
    expect(f.retirements.list()).toHaveLength(1);
    await f.media.reconcile();
    expect(await f.store.inspect("old.webm")).toBe("missing");
    expect(await f.store.read("unrelated")).toEqual(Buffer.from("keep"));
    expect(await f.store.inspect("new.webm")).toBe("available");
  } finally { await f.close(); }
});

it("scopes grants to their owner and aborts active reads when revoked", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const grant = f.media.issue("owner", "asset", "recipient", Date.now() + 60000);
    expect(() => f.media.resolve(grant.handle, "different-recipient")).toThrow("unavailable");
    const resolved = f.media.resolve(grant.handle, "recipient");
    expect(resolved.record).toEqual(f.original);
    await f.media.release("owner");
    expect(resolved.signal.aborted).toBe(true);
    expect(() => f.media.resolve(grant.handle, "recipient")).toThrow("unavailable");
  } finally { await f.close(); }
});

it("freshly hashes each preparation and rejects changed bytes", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    await expect(f.media.verify("owner", "asset", AbortSignal.timeout(5000))).resolves.toBeUndefined();
    await writeFile(join(f.directory, "old.webm"), "bad");
    await expect(f.media.verify("owner", "asset", AbortSignal.timeout(5000))).rejects.toThrow("integrity");
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
});

it("does not orphan the original on a failed metadata update", async () => {
  const f = await fixture();
  try {
    f.database.connection.exec("CREATE TRIGGER fail_asset_update BEFORE UPDATE ON asset_metadata BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    await expect(f.assets.save({ ...f.original, storagePath: "new.webm" })).rejects.toThrow();
    expect(f.retirements.list()).toEqual([]);
    await f.media.reconcile();
    expect(await f.store.inspect("old.webm")).toBe("available");
  } finally { await f.close(); }
});

it("keeps a retired version until its last open reader closes, even after ownership ends", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const read = await f.media.openRead(f.media.get("owner", "asset"));
    try {
      await f.media.mutate(async () => {
        await writeFile(join(f.directory, "new.webm"), "new");
        await f.assets.save({ ...f.original, storagePath: "new.webm" });
      });
      await f.media.release("owner");
      expect(await f.store.inspect("old.webm")).toBe("available");
      expect(f.retirements.list()).toHaveLength(1);
    } finally { await read.close(); }
    await read.close();
    expect(f.store.activeReaders).toBe(0);
    expect(await f.store.inspect("old.webm")).toBe("missing");
    expect(f.retirements.list()).toEqual([]);
  } finally { await f.close(); }
});

it("retains failed cleanup intent for retry and protects paths restored to current metadata", async () => {
  const f = await fixture();
  try {
    await f.assets.save({ ...f.original, storagePath: "new.webm" });
    const deletion = vi.spyOn(f.store, "delete").mockRejectedValueOnce(new Error("file is busy"));
    await expect(f.media.reconcile()).rejects.toThrow("busy");
    expect(f.retirements.list()).toHaveLength(1);
    await f.assets.save(f.original);
    await f.media.reconcile();
    expect(await f.store.inspect("old.webm")).toBe("available");
    expect(deletion.mock.calls).toEqual([["old.webm"], ["new.webm"]]);
    expect(f.retirements.list()).toEqual([]);
  } finally { await f.close(); }
});

it("renews the same grant, rejects wrong owners and expiry, and invalidates generations", async () => {
  const f = await fixture();
  let now = 1000;
  const media = new LocalMediaService({ assets: f.assets, store: f.store, retirements: f.retirements, now: () => now });
  try {
    await media.acquire("owner", ["asset"]);
    const first = media.issue("owner", "asset", "recipient", now + 60000);
    const active = media.resolve(first.handle, "recipient");
    expect(() => media.renew(first.handle, "wrong-owner", now + 60000)).toThrow("unavailable");
    expect(media.issue("owner", "asset", "recipient", now + 120000).handle).toBe(first.handle);
    now += 120001;
    expect(() => media.resolve(first.handle, "recipient")).toThrow("unavailable");
    expect(active.signal.aborted).toBe(true);
    const next = media.issue("owner", "asset", "recipient", now + 60000);
    await media.invalidate();
    expect(() => media.resolve(next.handle, "recipient")).toThrow("unavailable");
    expect(() => media.get("owner", "asset")).toThrow("unavailable");
    await media.acquire("new-generation", ["asset"]);
  } finally { await media.close(); await f.close(); }
});

it("coalesces duplicate recipients only inside a preparation group and rejects missing and resized files", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const reads = vi.spyOn(f.store, "openRead");
    await f.media.verifyGroup("owner", ["asset", "asset"], AbortSignal.timeout(5000));
    // One hash read and one identity-only open after hashing, shared by duplicate destinations.
    expect(reads).toHaveBeenCalledTimes(2);
    await f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000));
    expect(reads).toHaveBeenCalledTimes(4);
    await writeFile(join(f.directory, "old.webm"), "oversized");
    await expect(f.media.verify("owner", "asset", AbortSignal.timeout(5000))).rejects.toThrow("changed");
    await rm(join(f.directory, "old.webm"));
    await expect(f.media.verify("owner", "asset", AbortSignal.timeout(5000))).rejects.toThrow();
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
});

it("closes verification reads on cancellation without publishing a successful result", async () => {
  const f = await fixture();
  const cancellation = new AbortController();
  try {
    await f.media.acquire("owner", ["asset"]);
    const originalOpen = f.store.openRead.bind(f.store);
    vi.spyOn(f.store, "openRead").mockImplementation(async (path, size) => {
      const read = await originalOpen(path, size);
      cancellation.abort(new Error("preparation deadline expired"));
      return read;
    });
    await expect(f.media.verify("owner", "asset", cancellation.signal)).rejects.toThrow("deadline");
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
});

it("rejects unknown assets without retaining partial ownership and bounds grants", async () => {
  const f = await fixture();
  try {
    await expect(f.media.acquire("owner", ["asset", "missing"])).rejects.toThrow("unavailable");
    await f.media.acquire("owner", ["asset"]);
    const expiry = Date.now() + 60000;
    for (let index = 0; index < 4096; index++) f.media.issue("owner", "asset", `recipient-${index}`, expiry);
    expect(() => f.media.issue("owner", "asset", "overflow", expiry)).toThrow("unavailable");
    await f.media.release("owner");
    await f.media.acquire("owner", ["asset"]);
    expect(f.media.issue("owner", "asset", "recipient", expiry).handle).toMatch(/^med_[\w-]{43}$/);
  } finally { await f.close(); }
});

it("rejects grant reads after a verified version's file identity changes", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    await f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000));
    const grant = f.media.issue("owner", "asset", "recipient", Date.now() + 60000);
    const context = f.media.resolveForDelivery(grant.handle);
    const originalRead = await context.reader.openRead("ignored-path", 999);
    await originalRead.close();
    await writeFile(join(f.directory, "changed.webm"), "old");
    await rename(join(f.directory, "changed.webm"), join(f.directory, "old.webm"));
    await expect(context.reader.openRead("ignored-path", 999)).rejects.toThrow("changed");
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
});

it("atomically retires a deleted asset while existing owners keep its exact version", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("queued", ["asset"]);
    await f.media.mutate(() => f.assets.delete("asset"));
    expect(await f.assets.findById("asset")).toBeNull();
    expect(f.retirements.list()).toEqual([{ storagePath: "old.webm", assetId: "asset" }]);
    expect(await f.store.inspect("old.webm")).toBe("available");
    await expect(f.media.acquire("new", ["asset"])).rejects.toThrow("unavailable");
    await f.media.release("queued");
    expect(await f.store.inspect("old.webm")).toBe("missing");
  } finally { await f.close(); }
});

it("keeps committed replacement successful when Windows cleanup must be retried", async () => {
  const f = await fixture();
  const failures: unknown[] = [];
  const media = new LocalMediaService({ assets: f.assets, store: f.store, retirements: f.retirements, onCleanupError: error => failures.push(error) });
  try {
    await writeFile(join(f.directory, "new.webm"), "new");
    vi.spyOn(f.store, "delete").mockRejectedValueOnce(new Error("file is busy"));
    await expect(media.mutate(() => f.assets.save({ ...f.original, storagePath: "new.webm" }))).resolves.toMatchObject({ storagePath: "new.webm" });
    expect(failures).toHaveLength(1);
    expect(f.retirements.list()).toHaveLength(1);
    await media.reconcile();
    expect(f.retirements.list()).toEqual([]);
    expect(await f.store.inspect("new.webm")).toBe("available");
  } finally { await media.close(); await f.close(); }
});

it("expires abandoned owner lifetimes and invalidates owner contexts", async () => {
  const f = await fixture();
  vi.useFakeTimers();
  try {
    await f.media.acquire("preview", ["asset"], Date.now() + 1000);
    const context = f.media.context("preview", "asset");
    await vi.advanceTimersByTimeAsync(1001);
    expect(context.signal.aborted).toBe(true);
    expect(() => f.media.get("preview", "asset")).toThrow("unavailable");
    await expect(context.reader.openRead("ignored", 0)).rejects.toThrow();
  } finally { vi.useRealTimers(); await f.close(); }
});

it("captures admission versions and durations together, commits ownership, and releases rejected admission", async () => {
  const f = await fixture();
  try {
    await f.media.runAdmission(async () => {
      const captured = await f.media.captureAdmission(["asset"]);
      await f.media.mutate(async () => {
        await writeFile(join(f.directory, "new.webm"), "new");
        await f.assets.save({ ...f.original, storagePath: "new.webm", durationMs: 2000 });
      });
      expect((await f.media.captureAdmission(["asset"])).get("asset")).toEqual(captured.get("asset"));
      expect(captured.get("asset")?.durationMs).toBe(1000);
      f.media.commitAdmission(JSON.stringify(["alerts", "queued"]));
    });
    expect(f.media.counts.owners).toBe(1);
    await expect(f.media.runAdmission(async () => {
      await f.media.captureAdmission(["asset"]);
      throw new Error("queue rejected");
    })).rejects.toThrow("queue rejected");
    expect(f.media.counts.owners).toBe(1);
    await f.media.release(JSON.stringify(["alerts", "queued"]));
    expect(f.media.counts.owners).toBe(0);
    expect(await f.store.inspect("old.webm")).toBe("missing");
  } finally { await f.close(); }
});

it("fences new reads and preview acquisition throughout restore and drains an in-flight open", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const context = f.media.context("owner", "asset");
    const originalOpen = f.store.openRead.bind(f.store);
    let opened!: () => void;
    let resume!: () => void;
    const entered = new Promise<void>(resolve => { opened = resolve; });
    const blocked = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(f.store, "openRead").mockImplementationOnce(async (path, size) => {
      const read = await originalOpen(path, size);
      opened();
      await blocked;
      return read;
    });
    const pendingRead = context.reader.openRead("ignored", 0);
    await entered;
    let restoreEntered!: () => void;
    let restoreResume!: () => void;
    const restoreStarted = new Promise<void>(resolve => { restoreEntered = resolve; });
    const restoreBlocked = new Promise<void>(resolve => { restoreResume = resolve; });
    const restore = f.media.maintenance(async () => {
      expect(f.store.activeReaders).toBe(0);
      expect(f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
      restoreEntered();
      await restoreBlocked;
    });
    const rejectedRead = context.reader.openRead("ignored", 0);
    const rejectedPreview = f.media.acquire("preview", ["asset"]);
    resume();
    const read = await pendingRead;
    await expect(rejectedRead).rejects.toThrow("unavailable");
    await expect(rejectedPreview).rejects.toThrow("unavailable");
    await restoreStarted;
    expect(context.signal.aborted).toBe(true);
    expect(() => f.media.issue("owner", "asset", "recipient", Date.now() + 1000)).toThrow("unavailable");
    // A queued acquisition during the storage mutation is rejected even if it executes later.
    const latePreview = f.media.acquire("late-preview", ["asset"]);
    restoreResume();
    await expect(latePreview).rejects.toThrow("unavailable");
    await restore;
    await read.close();
    await f.media.acquire("next-generation", ["asset"]);
  } finally { await f.close(); }
});

it("shares simultaneous audio and visual integrity work only within their preparation group", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const reads = vi.spyOn(f.store, "openRead");
    await f.media.runPreparation(() => Promise.all([
      f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000)),
      f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000))
    ]));
    expect(reads).toHaveBeenCalledTimes(2);
    await f.media.runPreparation(() => Promise.all([
      f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000)),
      f.media.verifyGroup("owner", ["asset"], AbortSignal.timeout(5000))
    ]));
    expect(reads).toHaveBeenCalledTimes(4);
    expect(f.media.counts.readers).toBe(0);
  } finally { await f.close(); }
});
it("reopens admission after failed maintenance while rejecting every owner during its fence", async () => {
  const f = await fixture();
  try {
    await expect(f.media.maintenance(async () => {
      await expect(f.media.acquire("preview", ["asset"])).rejects.toThrow("unavailable");
      throw new Error("restore failed");
    })).rejects.toThrow("restore failed");
    await f.media.acquire("next", ["asset"]);
    expect(f.media.counts.owners).toBe(1);
  } finally { await f.close(); }
});

it("retains a shared timer icon grant until its last run releases ownership", async () => {
  const f = await fixture();
  try {
    await f.media.acquire('["timers","first"]', ["asset"]);
    await f.media.acquire('["timers","second"]', ["asset"]);
    const version = f.media.descriptor('["timers","first"]', "asset").version;
    f.media.shareVersion("shared-icon", '["timers","first"]', "asset", version);
    f.media.shareVersion("shared-icon", '["timers","second"]', "asset", version);
    const grant = f.media.issue("shared-icon", "asset", "desktop-timers", Date.now() + 60000);
    await f.media.mutate(async () => { await writeFile(join(f.directory, "new.webm"), "new"); await f.assets.save({ ...f.original, storagePath: "new.webm" }); });
    await f.media.release('["timers","first"]');
    const context = f.media.resolveForDelivery(grant.handle);
    expect(context.record.storagePath).toBe("old.webm");
    const read = await context.reader.openRead("ignored", 0);
    try { const bytes = Buffer.alloc(3); await read.handle.read(bytes, 0, 3, 0); expect(bytes.toString()).toBe("old"); }
    finally { await read.close(); }
    expect(await f.store.inspect("old.webm")).toBe("available");
    await f.media.release('["timers","second"]');
    expect(() => f.media.resolveForDelivery(grant.handle)).toThrow("unavailable");
    expect(f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
    expect(await f.store.inspect("old.webm")).toBe("missing");
  } finally { await f.close(); }
});

it("keeps two timer runs of one asset's different versions independently readable", async () => {
  const f = await fixture();
  try {
    await f.media.acquire('["timers","old-run"]', ["asset"]);
    const oldVersion = f.media.descriptor('["timers","old-run"]', "asset").version;
    await f.media.mutate(async () => { await writeFile(join(f.directory, "new.webm"), "new"); await f.assets.save({ ...f.original, storagePath: "new.webm" }); });
    await f.media.acquire('["timers","new-run"]', ["asset"]);
    const newVersion = f.media.descriptor('["timers","new-run"]', "asset").version;
    f.media.shareVersion("old-icon", '["timers","old-run"]', "asset", oldVersion);
    f.media.shareVersion("new-icon", '["timers","new-run"]', "asset", newVersion);
    const oldGrant = f.media.issue("old-icon", "asset", "desktop-timers", Date.now() + 60000);
    const newGrant = f.media.issue("new-icon", "asset", "desktop-timers", Date.now() + 60000);
    expect(f.media.resolveForDelivery(oldGrant.handle).record.storagePath).toBe("old.webm");
    expect(f.media.resolveForDelivery(newGrant.handle).record.storagePath).toBe("new.webm");
    await f.media.release('["timers","old-run"]');
    expect(() => f.media.resolveForDelivery(oldGrant.handle)).toThrow("unavailable");
    expect(f.media.resolveForDelivery(newGrant.handle).record.storagePath).toBe("new.webm");
    await f.media.release('["timers","new-run"]');
    expect(f.media.counts.owners).toBe(0);
  } finally { await f.close(); }
});

it.each([0, 1])("isolates cancellation of preparation recipient %s while a healthy recipient verifies", async cancelledIndex => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const original = f.store.openRead.bind(f.store);
    let entered!: () => void; let resume!: () => void;
    const opening = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(f.store, "openRead").mockImplementationOnce(async (path, size) => { const read = await original(path, size); entered(); await blocked; return read; });
    const controllers = [new AbortController(), new AbortController()];
    const results = f.media.runPreparation(() => controllers.map(controller => f.media.verifyGroup("owner", ["asset"], controller.signal)));
    await opening;
    controllers[cancelledIndex]!.abort(new Error("recipient stopped"));
    await expect(results[cancelledIndex]).rejects.toThrow("recipient stopped");
    expect(f.store.activeReaders).toBe(1);
    resume(); await expect(results[1 - cancelledIndex]).resolves.toBeUndefined();
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
});
it("drains shared preparation reads when the last recipient cancels", async () => {
  const f = await fixture();
  try {
    await f.media.acquire("owner", ["asset"]);
    const original = f.store.openRead.bind(f.store);
    let entered!: () => void; let resume!: () => void;
    const opening = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(f.store, "openRead").mockImplementationOnce(async (path, size) => { const read = await original(path, size); entered(); await blocked; return read; });
    const first = new AbortController(); const second = new AbortController();
    const results = f.media.runPreparation(() => [f.media.verifyGroup("owner", ["asset"], first.signal), f.media.verifyGroup("owner", ["asset"], second.signal)]);
    const settled = Promise.allSettled(results);
    await opening; first.abort(); second.abort(); resume();
    expect((await settled).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(f.store.activeReaders).toBe(0); expect(f.media.counts.readers).toBe(0);
  } finally { await f.close(); }
});
