import { expect, test } from "@playwright/test";
import { overlayCompositionSchema, type OverlayOutputView } from "@stream-jams/core";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test("saved canvas refresh is authoritative while empty/disabled and reconnect uses current metadata", async ({ page }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const outputResponse = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "alerts", targetProfileId: null, purpose: "live", scope: "module" });
    expect(outputResponse.status).toBe(200);
    const { url } = await outputResponse.json() as { url: string };
    const frames: unknown[] = [];
    page.on("websocket", socket => socket.on("framereceived", frame => { if (typeof frame.payload === "string") frames.push(JSON.parse(frame.payload)); }));
    const before = overlayCompositionSchema.parse(await (await fetch(`${url}/composition`)).json());
    await page.goto(url);
    await expect(page.getByTestId("overlay-root")).toBeVisible();
    await expect.poll(() => frames.some(frame => typeof frame === "object" && frame !== null && "type" in frame && frame.type === "overlay.connected")).toBe(true);
    const saved = await fixture.request("/overlay-modules/alerts/config", "PUT", { enabled: false, config: { canvas: { width: 800, height: 600 } } });
    expect(saved.status).toBe(200);
    const current = overlayCompositionSchema.parse(await (await fetch(`${url}/composition`)).json());
    expect(current.runtimeId).toBe(before.runtimeId);
    expect(current.canvas).toMatchObject({ width: 800, height: 600, kind: "scene" });
    expect(current.canvas.configRevision).toBeGreaterThan(before.canvas.configRevision);
    expect(current.modules).toEqual([]);
    await expect.poll(() => frames.some(frame => typeof frame === "object" && frame !== null && "composition" in frame &&
      overlayCompositionSchema.parse(frame.composition).canvas.configRevision === current.canvas.configRevision)).toBe(true);
    expect((await (await fixture.request("/management/overlay-outputs")).json() as OverlayOutputView[])
      .find(output => output.moduleId === "alerts" && output.targetProfileId === null && output.purpose === "live")?.canvas).toEqual(current.canvas);
    await page.reload();
    await expect(page.getByTestId("overlay-root")).toBeVisible();
    expect(overlayCompositionSchema.parse(await (await fetch(`${url}/composition`)).json()).canvas).toEqual(current.canvas);
    expect(await page.getByTestId("overlay-root").innerText()).toBe("");
    const invalid = await fixture.request("/overlay-modules/alerts/config", "PUT", { enabled: false, config: { canvas: { width: 0, height: 600 } } });
    expect(invalid.status).toBe(400);
    expect(overlayCompositionSchema.parse(await (await fetch(`${url}/composition`)).json()).canvas).toEqual(current.canvas);
    await page.goto(`${fixture.runtime.url}/manage/modules/music#browser-sources`);
    await expect(page.getByRole("article", { name: "Landscape browser source" })).toContainText("840 x 378");
    await expect(page.getByRole("article", { name: "Vertical browser source" })).toContainText("840 x 378");
  } finally { await fixture.close(); }
});
