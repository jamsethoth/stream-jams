import { expect, it, vi } from "vitest";
import { LocalMediaService, mediaVersion } from "./local-media-service.js";
import { MediaPreviewService } from "./media-preview-service.js";
import { LocalManagementSessionService } from "../auth/management-session-service.js";

const record = { id: "asset", originalFileName: "clip.mp4", mediaType: "video" as const, mimeType: "video/mp4", sizeBytes: 10,
  checksum: `sha256:${"a".repeat(64)}`, storagePath: "old.mp4", durationMs: 2000 };
async function fixture(ttl = 3600000) {
  const sessions = new LocalManagementSessionService({ sessionTtlMs: ttl });
  const session = await sessions.createSession();
  const assets = { findManyByIds: vi.fn(async () => new Map([["asset", record]])) };
  const media = new LocalMediaService({ assets, store: { openRead: vi.fn(), delete: vi.fn() },
    retirements: { list: () => [], isCurrent: () => false, forget: vi.fn() } });
  const previews = new MediaPreviewService({ media, sessions });
  return { sessions, session, assets, media, previews, async close() { await previews.close(); await media.close(); } };
}
it("renews the same URL and immutable duration after replacement, then aborts reads on logout", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  try {
    const first = await f.previews.create(f.session.id, "asset");
    const context = f.media.resolveForDelivery(first.url.slice(7));
    f.assets.findManyByIds.mockResolvedValue(new Map([["asset", { ...record, storagePath: "new.mp4", durationMs: 4000 }]]));
    await vi.advanceTimersByTimeAsync(60000);
    const renewed = await f.previews.renew(f.session.id, first.id);
    expect(renewed).toEqual({ ...first, expiresAt: first.expiresAt + 60000 });
    expect(renewed.snapshot.durationMs).toBe(2000);
    expect((await f.previews.create(f.session.id, "asset")).snapshot.durationMs).toBe(4000);
    await f.sessions.revokeSession(f.session.id);
    expect(context.signal.aborted).toBe(true);
    expect(() => f.media.resolveForDelivery(first.url.slice(7))).toThrow("unavailable");
    await expect(f.previews.renew(f.session.id, first.id)).rejects.toThrow("unavailable");
  } finally { await f.close(); vi.useRealTimers(); }
});
it("requires the current version for Music previews and invalidates strict previews on replacement", async () => {
  const f = await fixture();
  try {
    const reference = { assetId: "asset", version: mediaVersion(record), mimeType: "video/mp4" as const, sizeBytes: record.sizeBytes, durationMs: record.durationMs };
    const first = await f.previews.createVersioned(f.session.id, reference);
    expect(first.snapshot.version).toBe(reference.version);
    f.assets.findManyByIds.mockResolvedValue(new Map([["asset", { ...record, storagePath: "new.mp4", durationMs: 4000 }]]));
    await expect(f.previews.createVersioned(f.session.id, reference)).rejects.toThrow("unavailable");
    await f.previews.invalidateAsset("asset");
    expect(() => f.media.resolveForDelivery(first.url.slice(7))).toThrow("unavailable");
    await expect(f.previews.renew(f.session.id, first.id)).rejects.toThrow("unavailable");
  } finally { await f.close(); }
});
it("treats prototype-like asset IDs as ordinary versioned entries", async () => {
  const f = await fixture();
  try {
    const asset = { ...record, id: "__proto__" };
    f.assets.findManyByIds.mockResolvedValue(new Map([[asset.id, asset]]));
    const preview = await f.previews.createVersioned(f.session.id, {
      assetId: asset.id, version: mediaVersion(asset), mimeType: "video/mp4", sizeBytes: asset.sizeBytes, durationMs: asset.durationMs
    });
    expect(preview.snapshot.assetId).toBe(asset.id);
    expect(preview.snapshot.version).toBe(mediaVersion(asset));
  } finally { await f.close(); }
});
it("caps expiry at the session deadline and rejects expired renewal without reviving ownership", async () => {
  vi.useFakeTimers();
  const f = await fixture(90000);
  try {
    const first = await f.previews.create(f.session.id, "asset");
    expect(first.expiresAt).toBe(Date.parse(f.session.expiresAt));
    const context = f.media.resolveForDelivery(first.url.slice(7));
    await vi.advanceTimersByTimeAsync(90000);
    expect(context.signal.aborted).toBe(true);
    await expect(f.previews.renew(f.session.id, first.id)).rejects.toThrow("unavailable");
    await f.previews.release(f.session.id, first.id);
  } finally { await f.close(); vi.useRealTimers(); }
});
it("does not disclose, renew or revoke another session's preview and closes all owners", async () => {
  const f = await fixture();
  try {
    const first = await f.previews.create(f.session.id, "asset");
    const context = f.media.resolveForDelivery(first.url.slice(7));
    await expect(f.previews.renew("other", first.id)).rejects.toThrow("unavailable");
    await f.previews.release("other", first.id);
    expect(context.signal.aborted).toBe(false);
    await f.previews.close();
    expect(context.signal.aborted).toBe(true);
  } finally { await f.close(); }
});
