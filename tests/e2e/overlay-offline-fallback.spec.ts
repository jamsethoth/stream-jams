import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return await response.json() as T;
}

test("an overlay reloaded during a Stream Jams outage stays transparent and returns by itself", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    await checked(await fixture.request("/overlay-modules/timers/enabled", "PATCH", { enabled: true }));
    const timer = await checked<{ id: string }>(await fixture.request("/timers", "POST", { label: "Offline fallback timer", durationMs: 600_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } }));
    await checked(await fixture.request(`/timers/${timer.id}/start`, "POST"));
    const output = await checked<{ url: string }>(await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: "landscape" }));

    await page.goto(output.url);
    await expect(page.getByText("Offline fallback timer")).toBeVisible();
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: new URL(ready.scope).pathname, script: new URL(ready.active!.scriptURL).pathname, manage: (await navigator.serviceWorker.getRegistration("/manage")) !== undefined };
    });
    expect(registration).toEqual({ scope: "/overlay/", script: "/overlay/offline-worker.js", manage: false });

    await fixture.stop();
    await page.reload();
    expect(page.url()).toBe(output.url);
    const fallback = await page.evaluate(() => ({
      refresh: document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content") ?? null,
      text: document.body.innerText, children: document.body.children.length, scripts: document.scripts.length,
      background: getComputedStyle(document.body).backgroundColor
    }));
    expect(fallback).toEqual({ refresh: "2", text: "", children: 0, scripts: 0, background: "rgba(0, 0, 0, 0)" });

    // A source that never loaded has no worker yet, so its first load still fails.
    const fresh = await browser.newContext();
    try {
      await expect((await fresh.newPage()).goto(output.url)).rejects.toThrow(/ERR_CONNECTION_REFUSED/u);
    } finally { await fresh.close(); }

    await fixture.start();
    await expect(page.getByText("Offline fallback timer")).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(output.url);
  } finally { await page.goto("about:blank"); await fixture.close(); }
});
