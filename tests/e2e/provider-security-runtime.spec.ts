import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { alertEditorDocumentSchema, compatibilityAlertTextBoxStyle, compatibilityAlertTextStyle } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

// Actual sessions and scoped overlay URLs must never enter retry artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("built runtime persists uploaded fonts and warped text and delivers scoped playback under CSP", async ({ page, context }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const violations: string[] = [];
    const errors: string[] = [];
    await context.addInitScript(() => {
      (window as unknown as { securityViolations: string[] }).securityViolations = [];
      document.addEventListener("securitypolicyviolation", event => (window as unknown as { securityViolations: string[] }).securityViolations.push(`${event.violatedDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`));
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const setResponse = await fixture.request("/management/alert-sets", "POST", { name: "Runtime security acceptance" });
    expect(setResponse.status).toBe(201);
    const set = await setResponse.json() as { id: string };
    const alertResponse = await fixture.request(`/management/alert-sets/${set.id}/alerts`, "POST", { name: "Typography fixture", eventType: "follow" });
    expect(alertResponse.status).toBe(201);
    const alert = await alertResponse.json() as { id: string };
    const documentResponse = await fixture.request(`/management/alerts/${alert.id}/editor`);
    const original = alertEditorDocumentSchema.parse(await documentResponse.json());
    const alertDocument = alertEditorDocumentSchema.parse({ ...original, enabled: true, durationMs: 5000,
      layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, template: "Hello {actor.displayName}", textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" } }],
      targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "message", x: 100, y: 300, width: 1000, height: 280, zIndex: 0 }] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { actor: { displayName: "James" } } }]
    });
    const savedResponse = await fixture.request(`/management/alerts/${alert.id}/editor`, "PUT", { document: alertDocument });
    expect(savedResponse.status, await savedResponse.clone().text()).toBe(200);
    const media = await readFile(resolve("apps/web/public/storybook-assets/tiny-video.mp4"));
    const importedMedia = await fetch(`${fixture.runtime.url}/assets/import`, { method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "security-video.mp4", "x-stream-jams-mime-type": "video/mp4" }, body: media });
    expect(importedMedia.status, await importedMedia.clone().text()).toBe(201);
    const mediaAsset = await importedMedia.json() as { id: string };
    const editorUrl = `${fixture.runtime.url}/manage/modules/alerts/editor/${alert.id}?profile=landscape`;
    const response = await page.goto(editorUrl);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await page.getByRole("button", { name: "Message Text", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Typography" }).click();
    const font = await readFile(resolve("apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2"));
    await page.getByLabel("Upload reusable font", { exact: true }).setInputFiles({ name: "security-font.woff2", mimeType: "application/octet-stream", buffer: font });
    await expect(page.getByLabel("Uploaded font", { exact: true })).not.toHaveValue("");
    const fontId = await page.getByLabel("Uploaded font", { exact: true }).inputValue();
    await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
    await page.getByLabel("Warp text", { exact: true }).check();
    const handle = page.getByRole("button", { name: "Warp handle 2, 2", exact: true });
    const bounds = await handle.boundingBox();
    if (bounds === null) throw new Error("Warp handle is not visible");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 24, bounds.y - 12, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByLabel("Warp handle X", { exact: true })).not.toHaveValue("50");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const saveCompleted = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/management/alerts/${alert.id}/editor`));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saveCompleted).status()).toBe(200);
    const readbackResponse = await fixture.request(`/management/alerts/${alert.id}/editor`);
    const saved = alertEditorDocumentSchema.parse(await readbackResponse.json());
    expect(saved.layers[0]).toMatchObject({ type: "text", textStyle: { fontAssetId: fontId } });
    const savedText = saved.layers[0];
    if (savedText?.type !== "text" || !savedText.textStyle.warp) throw new Error("Saved text has no warp mesh");
    expect(savedText.textStyle.warp.points[4]?.x).not.toBe(0.5);
    violations.push(...await page.evaluate(() => (window as unknown as { securityViolations: string[] }).securityViolations));
    await page.reload();
    const rendered = page.getByRole("region", { name: "Landscape alert canvas" }).getByRole("img", { name: "Hello James" });
    await expect(rendered).toBeVisible();
    await expect.poll(() => rendered.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
    expect(await page.evaluate(async ({ url, headers }) => {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Media fetch failed ${response.status}`);
      const blob = await response.blob();
      return new Promise<boolean>((resolveVideo, rejectVideo) => {
        const video = document.createElement("video");
        video.onloadeddata = () => resolveVideo(video.videoWidth > 0);
        video.onerror = () => rejectVideo(new Error("Uploaded video could not render under CSP"));
        video.src = URL.createObjectURL(blob);
        document.body.append(video);
      });
    }, { url: `/assets/${mediaAsset.id}/file`, headers: fixture.headers })).toBe(true);
    const keyResponse = await fixture.request("/management/overlay-outputs/keys", "POST", { scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" });
    expect(keyResponse.status).toBe(200);
    const key = await keyResponse.json() as { url: string };
    const overlay = await context.newPage();
    overlay.on("pageerror", error => errors.push(error.message));
    overlay.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await overlay.goto(key.url);
    await expect.poll(async () => {
      const clients = await fixture.request("/management/overlay-clients");
      return (await clients.json() as unknown[]).length;
    }).toBeGreaterThan(0);
    const playback = await fixture.request(`/management/alerts/${alert.id}/editor/test`, "POST", { document: saved, targetProfileId: "landscape", samplePayload: { actor: { displayName: "Scoped runtime" } }, includeAudio: false, includeTts: false });
    expect(playback.status, await playback.clone().text()).toBe(200);
    const overlayText = overlay.getByRole("img", { name: "Hello Scoped runtime" });
    await expect(overlayText).toBeVisible();
    await expect.poll(() => overlayText.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
    await expect.poll(() => overlay.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
    violations.push(...await page.evaluate(() => (window as unknown as { securityViolations: string[] }).securityViolations), ...await overlay.evaluate(() => (window as unknown as { securityViolations: string[] }).securityViolations));
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
    await page.evaluate(url => new Promise<void>(resolveFrame => { const frame = document.createElement("iframe"); frame.onload = () => resolveFrame(); frame.src = url; document.body.append(frame); }), `${fixture.runtime.url}/manage`);
    await expect.poll(() => page.locator("iframe").evaluate((frame: HTMLIFrameElement) => { try { return frame.contentDocument === null; } catch { return true; } })).toBe(true);
    await overlay.close();
  } finally { await fixture.close(); }
});
