import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, DefaultAssetValidator, type AssetLibraryItem, type AssetRecord } from "@stream-jams/core";
import { mockManagementShell } from "./e2e-helpers.js";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBaseServerApp } from "../../apps/server/src/app.js";
import { registerWebShellRoutes } from "../../apps/server/src/http/routes/web-shell.js";

const webBuildDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/web/dist");
const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "e2e" } });
registerWebShellRoutes(app, { webBuildDirectory });
const publicFontBytes = await readFile(new URL("../../apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2", import.meta.url));
const publicVideoBytes = await readFile(new URL("../../apps/web/public/storybook-assets/tiny-video.mp4", import.meta.url));
app.get("/assets/font-fixture/file", (_request, reply) => reply.type("font/woff2").send(publicFontBytes));
app.get("/csp-fixture-video.mp4", (_request, reply) => reply.type("video/mp4").send(publicVideoBytes));

let productionUrl = "";

test.beforeAll(async () => {
  productionUrl = await app.listen({ host: "127.0.0.1", port: 0 });
});

test.afterAll(async () => {
  await app.close();
});

test("production Fastify shell loads hashed management route assets", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/auth/management/sessions", (route) => route.fulfill({ json: { id: "mgmt_production_shell" } }));
  await page.route("**/management/overlay-clients", (route) => route.fulfill({ json: [] }));
  await page.route("**/management/home", (route) => route.fulfill({ json: {
    readiness: [],
    activeAlertSet: null,
    alertConfiguration: { state: "no-active-set", enabledAlertCount: 0, items: [] },
    actionableProblems: []
  } }));

  const response = await page.goto(`${productionUrl}/manage`);

  expect(response?.headers()["content-type"]).toContain("text/html");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["content-security-policy"]).not.toContain("unsafe-eval");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("main.management-main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => path.endsWith(".js") || path.endsWith(".css")));
  const manifest = JSON.parse(await readFile(join(webBuildDirectory, ".vite", "manifest.json"), "utf8")) as Record<
    string,
    { readonly file: string; readonly css?: readonly string[]; readonly imports?: readonly string[] }
  >;
  const bootstrap = manifest["index.html"];
  const management = manifest["src/App.tsx"];
  if (bootstrap === undefined || management === undefined) {
    throw new Error("Production web manifest is missing the bootstrap or management route entry.");
  }
  const expectedResources = collectStaticResources(manifest, "src/App.tsx");
  const loadedResources = [...new Set(resources)].sort();

  expect(expectedResources.some((path) => path.endsWith(".js"))).toBe(true);
  expect(expectedResources.some((path) => path.endsWith(".css"))).toBe(true);
  expect(loadedResources).toEqual(expectedResources);
  expect(loadedResources).toContain(`/${bootstrap.file}`);
  expect(loadedResources).toContain(`/${management.file}`);
  expect(loadedResources.some((path) => path.startsWith("/src/"))).toBe(false);
  for (const asset of expectedResources) {
    expect(asset).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{8}\.(?:css|js)$/u);
  }
  expect(browserErrors).toEqual([]);
});

function collectStaticResources(
  manifest: Readonly<Record<string, { readonly file: string; readonly css?: readonly string[]; readonly imports?: readonly string[] }>>,
  startKey: string
): string[] {
  const visited = new Set<string>();
  const resources = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (entry === undefined) throw new Error(`Production web manifest import ${key} is missing.`);
    visited.add(key);
    resources.add(`/${entry.file}`);
    for (const cssFile of entry.css ?? []) resources.add(`/${cssFile}`);
    for (const importedKey of entry.imports ?? []) visit(importedKey);
  };
  visit(startKey);
  return [...resources].sort();
}

test("production CSP permits uploaded fonts and rendered warped text", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`); });
  await mockManagementShell(page);
  await page.route("**/management/providers?capability=tts", route => route.fulfill({ json: [] }));
  const fontBytes = readFileSync(new URL("../../apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2", import.meta.url));
  const checksum = createHash("sha256").update(fontBytes).digest("hex");
  let font: AssetRecord | null = null;
  let saved = alertEditorDocumentSchema.parse({ schemaVersion: 1, id: "alert-font", setId: "set-font", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null, name: "Typography fixture", enabled: true, conditions: [], durationMs: 5000,
    layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, template: "Hello {actor.displayName}", textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" } }],
    targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "message", x: 100, y: 300, width: 1000, height: 280, zIndex: 0 }] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }], samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { actor: { displayName: "James" } } }] });
  const overview = { id: "set-font", name: "Font fixture", active: false, starter: false, starterReviewState: "complete", enabledAlertCount: 1, profileUsage: [{ id: "landscape", enabledAlertCount: 1, playableAlertCount: 1, blockerCount: 0, warningCount: 0 }], validationIssues: [], outputs: [] };
  await page.route("**/management/alert-sets", route => route.fulfill({ json: [overview] }));
  await page.route("**/management/alert-sets/set-font", route => route.fulfill({ json: { overview, inventory: [{ id: saved.id, setId: saved.setId, providerKind: "twitch", eventType: "follow", name: saved.name, kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Hello James" }], browserSources: [] } }));
  await page.route("**/management/alerts/alert-font/editor", async route => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PUT") saved = alertEditorDocumentSchema.parse(route.request().postDataJSON().document);
    await route.fulfill({ json: saved });
  });
  await page.route("**/management/alerts/alert-font/editor/variation-context", route => route.fulfill({ json: { ruleId: saved.id, eventType: saved.eventType, candidates: [{ editorId: saved.id, variantId: "default", kind: "default", name: "Default", enabled: true, conditions: [], weight: 1, priority: null }] } }));
  await page.route("**/management/assets/library", route => {
    const items: AssetLibraryItem[] = font === null ? [] : [{ id: font.id, originalFileName: font.originalFileName, displayName: "Reusable test font", mediaType: "font", mimeType: font.mimeType, sizeBytes: font.sizeBytes, width: null, height: null, durationMs: null, health: "available", tags: [], createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", usage: { assetId: font.id, totalUsageCount: 0, usages: [] } }];
    return route.fulfill({ json: items });
  });
  await page.route("**/assets/import", async route => {
    const bytes = route.request().postDataBuffer()!;
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    expect(new DefaultAssetValidator().validate({ originalFileName: "fixture.woff2", mimeType: route.request().headers()["x-stream-jams-mime-type"]!, bytes, sizeBytes: bytes.length }).accepted).toBe(true);
    font = { id: "font-fixture", originalFileName: "fixture.woff2", mediaType: "font", mimeType: "font/woff2", sizeBytes: bytes.length, checksum, storagePath: "font/font-fixture.woff2", durationMs: null };
    await route.fulfill({ json: font });
  });
  await page.goto(`${productionUrl}/manage/modules/alerts/editor/alert-font?profile=landscape`);
  await page.getByRole("button", { name: "Message Text", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Typography" }).click();
  await page.getByLabel("Upload reusable font", { exact: true }).setInputFiles({ name: "fixture.woff2", mimeType: "application/octet-stream", buffer: fontBytes });
  await expect(page.getByLabel("Uploaded font", { exact: true })).toHaveValue("font-fixture");
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
  await page.getByLabel("Warp text", { exact: true }).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const rendered = page.getByRole("region", { name: "Landscape alert canvas" }).getByRole("img", { name: "Hello James" });
  await expect(rendered).toBeVisible();
  await expect.poll(() => rendered.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
  expect(await page.evaluate(() => new Promise<boolean>((resolveMedia, rejectMedia) => {
    const video = document.createElement("video");
    video.addEventListener("loadeddata", () => resolveMedia(video.videoWidth > 0), { once: true });
    video.addEventListener("error", () => rejectMedia(new Error("Same-origin video failed under CSP")), { once: true });
    video.src = "/csp-fixture-video.mp4";
    document.body.append(video);
  }))).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("production management and operator shells reject framing", async ({ page, request }) => {
  for (const path of ["/manage", "/operator"]) {
    const response = await request.get(`${productionUrl}${path}`);
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    await page.goto(productionUrl);
    await page.evaluate(url => new Promise<void>(resolveLoad => {
      const frame = document.createElement("iframe");
      frame.addEventListener("load", () => resolveLoad(), { once: true });
      frame.src = url;
      document.body.append(frame);
    }), `${productionUrl}${path}`);
    await expect.poll(() => page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      try { return frame.contentDocument === null; } catch { return true; }
    })).toBe(true);
  }
});
