import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBaseServerApp } from "../../apps/server/src/app.js";
import { registerAssetRoutes } from "../../apps/server/src/http/routes/assets.js";

for (const extension of ["mp4", "webm"]) {
  test(`cold ${extension} video seeks through the real asset endpoint before synchronized playback`, async ({ page }) => {
    const bytes = await readFile(resolve(`tests/fixtures/media/neutral-trackless.${extension}`));
    const asset = { id: "clip", originalFileName: `clip.${extension}`, mediaType: "video" as const, mimeType: `video/${extension}`, sizeBytes: bytes.length, checksum: "fixture", storagePath: "fixture", durationMs: null };
    const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "test" } });
    app.addHook("onRequest", async (_request, reply) => { reply.header("access-control-allow-origin", "*"); });
    registerAssetRoutes(app, {
      assetRepository: { list: async () => [asset], findById: async () => asset },
      assetStore: { read: async () => bytes },
      mediaImportPipeline: { importMedia: async () => asset },
      managementAuthPreHandler: async () => {}, managementRateLimitPreHandler: async () => {},
      overlayAccessService: { verifyRouteAccess: async request => ({ authorized: true, record: { id: "fixture", overlayId: request.overlayId, moduleId: request.moduleId, purpose: request.purpose, scope: request.scope, keyHash: "fixture", routeKeySecretRef: null, createdAt: "2026-09-30T00:00:00Z", revokedAt: null } }) }
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    try {
      expect((await app.inject("/health")).statusCode).toBe(200);
      await page.goto("/");
      const statuses: number[] = [];
      page.on("response", response => { if (response.url().startsWith(address + "/overlay/")) statuses.push(response.status()); });
      const prepared = await page.evaluate(async ({ address, modulePath }) => {
        const { prepareTimedMedia } = await import(modulePath);
        const result: number[] = [];
        for (const path of ["/overlay/modules/alerts/live/fixture/assets/clip", "/overlay/unified/live/fixture/assets/clip"]) {
          const video = document.createElement("video"); video.muted = true; video.preload = "metadata";
          document.body.append(video);
          try {
            await new Promise<void>((resolve, reject) => {
              video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Fixture metadata failed"));
              video.src = address + path;
            });
            const now = Date.now();
            await prepareTimedMedia(video, { startsAtEpochMs: now - 100, endsAtEpochMs: now + 5000 }, { signal: new AbortController().signal, deadlineMs: now + 5000 });
            result.push(video.currentTime);
            await video.play();
          } finally { video.pause(); video.removeAttribute("src"); video.load(); video.remove(); }
        }
        return result;
      }, { address, modulePath: `/@fs/${resolve("packages/core/src/audio/prepare-timed-media.ts").replaceAll("\\", "/")}` });
      expect(prepared).toHaveLength(2);
      for (const position of prepared) expect(position).toBeGreaterThanOrEqual(0.08);
      expect(statuses).toContain(206);
      expect(statuses).not.toContain(200);
    } finally { await app.close(); }
  });
}
