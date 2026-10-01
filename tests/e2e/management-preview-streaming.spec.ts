import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { MediaPreviewDescriptor } from "@stream-jams/core";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { SqliteAssetRepository } from "../../apps/server/dist/modules/assets/sqlite-asset-repository.js";
import { SqliteAssetLibraryMetadataRepository } from "../../apps/server/dist/modules/assets/sqlite-asset-library-metadata-repository.js";
import { startLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test("rebuilt management preview keeps its native source through renewal and replacement, then releases on navigation", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-preview-stream-"));
  const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port: await unusedPort() } };
  const runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"),
    configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
  try {
    const original = await readFile(resolve("tests/fixtures/media/neutral-trackless.mp4"));
    const replacement = await readFile(resolve("tests/fixtures/media/neutral-with-audio.mp4"));
    const storagePath = "video/preview-stream-original.mp4";
    await mkdir(join(config.storage.assetDirectory, "video"), { recursive: true });
    await writeFile(join(config.storage.assetDirectory, storagePath), original);
    await new SqliteAssetRepository(runtime.composition.database.connection).save({ id: "preview-clip", originalFileName: "preview.mp4", mediaType: "video", mimeType: "video/mp4",
      storagePath, sizeBytes: original.length, checksum: `sha256:${createHash("sha256").update(original).digest("hex")}`, durationMs: 1000 });
    await new SqliteAssetLibraryMetadataRepository(runtime.composition.database.connection).save({ assetId: "preview-clip", displayName: "Preview fixture", tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const baseline = runtime.composition.localMediaService.counts;
    const descriptors: MediaPreviewDescriptor[] = [];
    const renewals: MediaPreviewDescriptor[] = [];
    const readHeaders: Record<string, string>[] = [];
    const mediaResponses: { status: number; cache: string | null }[] = [];
    let mutationHeaders: Record<string, string> = {};
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/media/")) readHeaders.push(request.headers());
      if (path.endsWith("/preview")) mutationHeaders = request.headers();
    });
    page.on("response", async response => {
      const path = new URL(response.url()).pathname;
      if (path.endsWith("/preview") && response.status() === 201) descriptors.push(await response.json() as MediaPreviewDescriptor);
      if (path.endsWith("/renew") && response.ok()) renewals.push(await response.json() as MediaPreviewDescriptor);
      if (path.startsWith("/media/")) mediaResponses.push({ status: response.status(), cache: response.headers()["cache-control"] ?? null });
    });
    await page.clock.install({ time: Date.now() });
    await page.goto(`${runtime.url}/manage/assets`);
    await page.getByRole("button", { name: "Preview fixture", exact: true }).click();
    const video = page.locator("video[controls]");
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
    const originalUrl = await video.getAttribute("src");
    expect(originalUrl).toMatch(/^\/media\/med_/);
    const oldDescriptor = descriptors.find(value => value.url === originalUrl)!;
    expect(oldDescriptor.snapshot.durationMs).toBe(1000);
    await video.evaluate(element => { element.setAttribute("data-renewal-probe", "same-element"); });
    await page.clock.fastForward(60000);
    await expect.poll(() => renewals.some(value => value.id === oldDescriptor.id)).toBe(true);
    expect(renewals.find(value => value.id === oldDescriptor.id)?.url).toBe(originalUrl);
    await expect(video).toHaveAttribute("data-renewal-probe", "same-element");
    await expect(video).toHaveAttribute("src", originalUrl!);
    const replaced = await page.request.post(`${runtime.url}/assets/preview-clip/replace`, { data: replacement, headers: {
      authorization: mutationHeaders.authorization!, "x-stream-jams-csrf": mutationHeaders["x-stream-jams-csrf"]!, origin: runtime.url,
      "content-type": "application/octet-stream", "x-stream-jams-file-name": "replacement.mp4", "x-stream-jams-mime-type": "video/mp4", "x-stream-jams-confirm-impact": "true"
    } });
    expect(replaced.status()).toBe(200);
    await expect(video).toHaveAttribute("src", originalUrl!);
    const retained = await page.request.get(runtime.url + originalUrl!, { headers: { range: "bytes=0-15" } });
    expect(retained.status()).toBe(206);
    expect(await retained.body()).toEqual(original.subarray(0, 16));
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect.poll(() => runtime.composition.localMediaService.counts).toEqual(baseline);
    expect((await page.request.get(runtime.url + originalUrl!)).status()).toBe(404);
    await page.getByRole("link", { name: "Assets", exact: true }).click();
    await page.getByRole("button", { name: "Preview fixture", exact: true }).click();
    await expect.poll(() => video.getAttribute("src")).not.toBe(originalUrl);
    const nextUrl = await video.getAttribute("src");
    await expect.poll(() => descriptors.some(value => value.url === nextUrl)).toBe(true);
    expect(descriptors.find(value => value.url === nextUrl)?.snapshot.version).not.toBe(oldDescriptor.snapshot.version);
    expect(readHeaders.length).toBeGreaterThan(0);
    for (const headers of readHeaders) { expect(headers.referer ?? "").toBe(""); expect(headers.authorization).toBeUndefined(); }
    expect(mediaResponses.some(value => value.status === 206)).toBe(true);
    for (const response of mediaResponses) expect(response.cache).toBe("no-store");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect.poll(() => runtime.composition.localMediaService.counts).toEqual(baseline);
    expect(await video.count()).toBe(0);
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No isolated test port");
  await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)));
  return address.port;
}

for (const mediaType of ["image", "audio", "video"] as const) {
  test(`management ${mediaType} preview reports a native read failure after successful grant acquisition`, async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "stream-jams-preview-read-failure-"));
    const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port: await unusedPort() } };
    const runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"),
      configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
    try {
      const fileName = mediaType === "image" ? "tiny-image.png" : mediaType === "audio" ? "tiny-audio.wav" : "tiny-video.mp4";
      const mimeType = mediaType === "image" ? "image/png" : mediaType === "audio" ? "audio/wav" : "video/mp4";
      const bytes = await readFile(resolve("apps/web/public/storybook-assets", fileName));
      const storagePath = `${mediaType}/${fileName}`;
      await mkdir(join(config.storage.assetDirectory, mediaType), { recursive: true });
      await writeFile(join(config.storage.assetDirectory, storagePath), bytes);
      await new SqliteAssetRepository(runtime.composition.database.connection).save({ id: "failed-preview", originalFileName: fileName, mediaType, mimeType,
        storagePath, sizeBytes: bytes.length, checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, durationMs: mediaType === "image" ? null : 1000 });
      await new SqliteAssetLibraryMetadataRepository(runtime.composition.database.connection).save({ assetId: "failed-preview", displayName: "Failed preview fixture", tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      const baseline = runtime.composition.localMediaService.counts;
      let grants = 0;
      let failedReads = 0;
      page.on("response", response => { if (new URL(response.url()).pathname.endsWith("/preview") && response.status() === 201) grants++; });
      await page.route("**/media/**", async route => {
        failedReads++;
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Media source unavailable" }) });
      });
      await page.goto(`${runtime.url}/manage/assets`);
      const tableFailure = page.getByRole("table").getByText("Preview unavailable", { exact: true });
      const detailsFailure = page.getByRole("region", { name: "Failed preview fixture details" }).getByText("Preview unavailable", { exact: true });
      await expect(tableFailure).toBeVisible();
      await expect(detailsFailure).toBeVisible();
      await expect.poll(() => grants).toBe(2);
      expect(failedReads).toBeGreaterThan(0);
      await expect(page.locator("img.asset-preview__media, video.asset-preview__media, audio.asset-preview__audio")).toHaveCount(0);
      for (const failure of [tableFailure, detailsFailure]) {
        await expect(failure).toHaveAttribute("title", "Retry by reselecting the asset. Reference: asset-preview-failed-preview");
      }
      await expect.poll(() => runtime.composition.localMediaService.counts).toEqual(baseline);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByRole("link", { name: "Assets", exact: true }).click();
      await expect(tableFailure).toBeVisible();
      await expect(detailsFailure).toBeVisible();
      await expect.poll(() => grants).toBe(4);
      await expect.poll(() => runtime.composition.localMediaService.counts).toEqual(baseline);
    } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
  });
}
