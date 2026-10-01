import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { MediaCapacityError, LocalMediaService } from "../../modules/assets/local-media-service.js";
import { MediaPreviewService } from "../../modules/assets/media-preview-service.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createManagementSecurityPreHandler } from "../middleware/management-security.js";
import { registerAssetPreviewRoutes } from "./assets-preview.js";

it("protects preview mutations with session, origin and CSRF; descriptors keep one URL across renewal", async () => {
  const app = Fastify();
  const sessions = new LocalManagementSessionService();
  const session = await sessions.createSession();
  const record = { id: "asset", originalFileName: "clip.mp4", mediaType: "video" as const, mimeType: "video/mp4", sizeBytes: 10,
    checksum: `sha256:${"a".repeat(64)}`, storagePath: "old.mp4", durationMs: 2000 };
  const media = new LocalMediaService({ assets: { findManyByIds: async ids => new Map(ids.includes("asset") ? [["asset", record]] : []) },
    store: { openRead: vi.fn(), delete: vi.fn() }, retirements: { list: () => [], isCurrent: () => false, forget: vi.fn() } });
  const previews = new MediaPreviewService({ media, sessions });
  registerAssetPreviewRoutes(app, { mediaPreviewService: previews, managementRateLimitPreHandler: async () => {},
    managementAuthPreHandler: createManagementSecurityPreHandler({ sessionService: sessions, originPolicy: { allowedOrigins: new Set(["http://localhost"]) } }) });
  const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: "http://localhost" };
  try {
    expect((await app.inject({ method: "POST", url: "/assets/asset/preview" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/assets/asset/preview", headers: { ...headers, origin: "https://foreign.example" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/assets/asset/preview", headers: { ...headers, "x-stream-jams-csrf": "wrong" } })).statusCode).toBe(403);
    const created = await app.inject({ method: "POST", url: "/assets/asset/preview", headers });
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(created.headers["referrer-policy"]).toBe("no-referrer");
    const descriptor = created.json<{ id: string; url: string }>();
    expect(descriptor.url).toMatch(/^\/media\/med_[A-Za-z0-9_-]{43}$/);
    const renewed = await app.inject({ method: "POST", url: `/assets/previews/${descriptor.id}/renew`, headers });
    expect(renewed.json<{ url: string }>().url).toBe(descriptor.url);
    expect((await app.inject({ method: "DELETE", url: `/assets/previews/${descriptor.id}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: `/assets/previews/${descriptor.id}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/assets/previews/${descriptor.id}/renew`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/assets/missing/preview", headers })).statusCode).toBe(404);
  } finally { await app.close(); await previews.close(); await media.close(); }
});

it("returns actionable 503 capacity errors without releasing an existing preview", async () => {
  const app = Fastify(); const sessions = new LocalManagementSessionService(); const session = await sessions.createSession();
  const media = new LocalMediaService({ assets: { findManyByIds: async () => new Map() }, store: { openRead: vi.fn(), delete: vi.fn() }, retirements: { list: () => [], isCurrent: () => false, forget: vi.fn() } });
  const previews = new MediaPreviewService({ media, sessions });
  vi.spyOn(previews, "create").mockRejectedValueOnce(new MediaCapacityError());
  registerAssetPreviewRoutes(app, { mediaPreviewService: previews, managementRateLimitPreHandler: async () => {}, managementAuthPreHandler: createManagementSecurityPreHandler({ sessionService: sessions, originPolicy: { allowedOrigins: new Set(["http://localhost"]) } }) });
  try {
    const response = await app.inject({ method: "POST", url: "/assets/asset/preview", headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: "http://localhost" } });
    expect(response.statusCode).toBe(503); expect(response.json()).toMatchObject({ error: { code: "MEDIA_CAPACITY", message: expect.stringContaining("Close unused previews") } });
  } finally { await app.close(); await previews.close(); await media.close(); }
});
