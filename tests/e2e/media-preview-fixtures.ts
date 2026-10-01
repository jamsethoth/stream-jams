import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { MediaPreviewDescriptor, MediaVersionSnapshot } from "@stream-jams/core";
import { expect, type Page } from "@playwright/test";

type Source = { readonly mimeType: MediaVersionSnapshot["mimeType"]; readonly durationMs?: number | null; readonly body?: Buffer | string; readonly path?: string };
/** Mirrors the management owner boundary while native elements read checked-in fixtures. */
export async function mockMediaPreviews(page: Page, source: (id: string) => Source) {
  const owners = new Map<string, { descriptor: MediaPreviewDescriptor; source: Source }>();
  await page.route("**/assets/*/preview", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    const media = source(id);
    const descriptor: MediaPreviewDescriptor = { id: randomUUID(), url: `/media/med_${randomBytes(32).toString("base64url")}`, expiresAt: Date.now() + 300000,
      snapshot: { assetId: id, version: "a".repeat(64), mimeType: media.mimeType, sizeBytes: 100, durationMs: media.durationMs ?? (media.mimeType.startsWith("image/") ? null : 1000) } };
    owners.set(descriptor.id, { descriptor, source: media });
    await route.fulfill({ status: 201, json: descriptor });
  });
  await page.route("**/assets/previews/*/renew", async route => {
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    const owner = owners.get(id);
    if (owner === undefined) return route.fulfill({ status: 404 });
    owner.descriptor = { ...owner.descriptor, expiresAt: Date.now() + 300000 };
    await route.fulfill({ json: owner.descriptor });
  });
  await page.route("**/assets/previews/*", async route => {
    if (route.request().method() !== "DELETE") return route.fallback();
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    owners.delete(new URL(route.request().url()).pathname.split("/").at(-1)!);
    await route.fulfill({ status: 204 });
  });
  await page.route("**/media/med_*", async route => {
    const path = new URL(route.request().url()).pathname;
    const owner = [...owners.values()].find(value => value.descriptor.url === path);
    if (owner === undefined) return route.fulfill({ status: 404 });
    expect(route.request().headers().referer).toBeUndefined();
    const media = owner.source;
    await route.fulfill({ contentType: media.mimeType, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
      ...(media.body === undefined ? { path: media.path ?? resolve(`apps/web/public/storybook-assets/${media.mimeType.startsWith("audio/") ? "tiny-audio.wav" : media.mimeType.startsWith("video/") ? "tiny-video.mp4" : "tiny-image.png"}`) } : { body: media.body }) });
  });
  return { owners };
}
