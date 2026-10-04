import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MusicModuleConfig } from "../../packages/core/dist/index.js";
import { expect, test } from "@playwright/test";
import { startMusicTestRuntime } from "./music-test-runtime.js";

test("unsafe CSS is rejected at the real save boundary and cannot create browser requests", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await startMusicTestRuntime();
  const external: string[] = [];
  const consoleMessages: string[] = [];
  page.on("request", request => { if (!request.url().startsWith(fixture.url)) external.push(request.url()); });
  page.on("console", message => consoleMessages.push(message.text()));
  try {
    await page.goto(`${fixture.url}/manage/modules/music`);
    await expect(page.getByRole("region", { name: "Music preview" }).getByTestId("music-widget")).toBeVisible();
    const original = await fixture.request<{ enabled: boolean; config: Record<string, unknown> }>("/overlay-modules/music/config");
    const css = page.getByRole("textbox", { name: "Custom CSS" });
    await page.getByLabel("Enable custom CSS").check();
    await css.fill(".sj-title { background-image: url(https://outside.example.invalid/track); }");
    await expect(page.getByRole("region", { name: "Advanced CSS" }).getByRole("alert")).toBeVisible();
    await expect(page.getByRole("region", { name: "Music preview" }).getByTestId("music-widget")).toBeVisible();
    await page.getByRole("button", { name: "Save Music appearance" }).click();
    await expect(page.getByText("Unable to save Music appearance")).toBeVisible();
    const rejected = await page.request.put(`${fixture.url}/overlay-modules/music/config`, {
      headers: fixture.headers, data: { enabled: original.enabled, config: { ...original.config, css: { source: ".sj-title { background: u\\72l(https://outside.example.invalid/escaped); }", enabled: true, styleContractVersion: 1 } } }
    });
    expect(rejected.ok()).toBe(false);
    const indirect = await page.request.put(`${fixture.url}/overlay-modules/music/config`, {
      headers: fixture.headers, data: { enabled: original.enabled, config: { ...original.config, css: { source: ".sj-title { --remote: url(https://outside.example.invalid/indirect); background: var(--remote); }", enabled: true, styleContractVersion: 1 } } }
    });
    expect(indirect.ok()).toBe(false);
    expect((await fixture.request<{ config: { css: unknown } }>("/overlay-modules/music/config")).config.css).toEqual((original.config as { css: unknown }).css);
    expect(external).toEqual([]);
    expect(consoleMessages.join(" ")).not.toContain("throwaway-token");
    await page.getByRole("button", { name: "Disable custom CSS" }).click();
    await expect(page.getByLabel("Enable custom CSS")).not.toBeChecked();
    await page.getByRole("button", { name: "Clear CSS" }).click();
    await css.fill(".sj-title { color: rgb(1, 2, 3); animation: fade 2s linear; } @media (min-width: 1px) { .sj-time { letter-spacing: 1px; } } @container (min-width: 100px) { .sj-artists { opacity: .8; } } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }");
    await page.getByLabel("Enable custom CSS").check();
    await expect(page.getByText("CSS is valid.")).toBeVisible();
    await page.getByRole("button", { name: "Save Music appearance" }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    const scope = await page.getByTestId("music-widget").evaluate(host => {
      const sibling = document.createElement("div"); sibling.className = "sj-title"; sibling.textContent = "Outside"; document.body.append(sibling);
      const inside = host.shadowRoot!.querySelector(".sj-title")!;
      const result = { inside: getComputedStyle(inside).color, outside: getComputedStyle(sibling).color,
        namespacedAnimation: [...host.shadowRoot!.querySelectorAll("style")].some(style => /@keyframes sj-/u.test(style.textContent ?? "")) };
      sibling.remove(); return result;
    });
    expect(scope.inside).toBe("rgb(1, 2, 3)");
    expect(scope.outside).not.toBe(scope.inside);
    expect(scope.namespacedAnimation).toBe(true);
    await page.reload();
    await expect(css).toHaveValue(/letter-spacing: 1px/u);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("region", { name: "Music preview" }).getByTestId("music-widget")).toBeVisible();
    expect(await page.getByTestId("music-widget").locator(".sj-title").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    expect(external).toEqual([]);
  } finally { await fixture.close(); }
});

test("uploaded branding uses authorized output URLs and backup restores appearance without Pear credentials", async ({ page, context }) => {
  test.setTimeout(90_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: { videoId: "brand-song", title: "Branded Track", artist: "Fixture", songDuration: 60, elapsedSeconds: 5 } });
    await fixture.register();
    const bytes = await readFile(resolve("apps/web/public/storybook-assets/tiny-image.png"));
    const imported = await fetch(`${fixture.url}/assets/import`, { method: "POST", headers: {
      ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "tiny-image.png", "x-stream-jams-mime-type": "image/png"
    }, body: bytes });
    expect(imported.ok, `Asset import: ${imported.status}`).toBe(true);
    const asset = await imported.json() as { id: string };
    const saved = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    const branded = structuredClone(saved.config);
    branded.profiles.landscape.views.full.branding.assetId = asset.id;
    branded.profiles.landscape.views.full.branding.fit = "contain";
    branded.profiles.landscape.views.full.branding.opacity = 35;
    branded.profiles.vertical.views.compact.branding.assetId = asset.id;
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: branded });
    const live = await fixture.request<{ url: string }>("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "music", scope: "module", purpose: "live", targetProfileId: "landscape" });
    const unified = await fixture.request<{ url: string }>("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: null, scope: "unified", purpose: "live", targetProfileId: null });
    await page.goto(live.url);
    const image = page.getByTestId("music-widget").locator(".sj-brand-image");
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("opacity", "0.35");
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    const privateUrl = await image.getAttribute("src");
    expect(privateUrl).toMatch(/\/overlay\/.*\/assets\//u);
    const denied = await context.request.get(`${fixture.url}/assets/${asset.id}`);
    expect(denied.status()).toBeGreaterThanOrEqual(400);
    const unifiedPage = await context.newPage(); await unifiedPage.goto(unified.url);
    await expect(unifiedPage.getByTestId("music-widget").locator(".sj-brand-image")).toBeVisible();
    // Backup preflight requires the standard starter alert set to have been initialized.
    await fixture.request("/management/alert-sets");
    const archive = await fixture.request<Record<string, unknown>>("/management/settings/backup");
    expect(JSON.stringify(archive)).not.toContain("throwaway-token");
    expect(JSON.stringify(archive)).toContain(asset.id);
    const preflight = await fixture.request<{ archiveId: string; state: string }>("/management/settings/backup/preflight", "POST", archive);
    expect(preflight.state).toBe("valid");
    await fixture.request("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
    const restored = await fixture.request<{ enabled: boolean; config: MusicModuleConfig }>("/overlay-modules/music/config");
    expect(restored.config.profiles.landscape.views.full.branding.assetId).toBe(asset.id);
    expect(restored.config.profiles.vertical.views.compact.branding.assetId).toBe(asset.id);
    expect(restored.enabled).toBe(true);
    await expect.poll(() => fixture.runtime.composition.musicRuntimeCoordinator.getProjection("landscape")).toBeNull();
    await unifiedPage.close();
  } finally { await fixture.close(); }
});
