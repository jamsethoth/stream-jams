import { expect, test } from "@playwright/test";
import { overlayCompositionSchema, type OverlayOutputView } from "@stream-jams/core";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";
import { createPreMigrationDatabase } from "../../apps/server/src/test-support/pre-migration-database.js";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("saved canvas refresh is authoritative while empty/disabled and reconnect uses current metadata", async ({ page }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    using old = createPreMigrationDatabase("047-retire-public-overlays");
    const rawKey = "ovl_historical_canvas_fixture";
    old.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,created_at) VALUES ('legacy-canvas','default','alerts','live','module',?,'2026-10-11T00:00:00Z')").run(`sha256:${createHash("sha256").update(rawKey).digest("hex")}`);
    await mkdir(join(fixture.homeDirectory, ".stream-jams", "data"), { recursive: true });
    old.connection.prepare("VACUUM INTO ?").run(join(fixture.homeDirectory, ".stream-jams", "data", "stream-jams.sqlite"));
    await fixture.start();
    const url = `${fixture.runtime.url}/overlay/modules/alerts/live/${rawKey}`;
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
      .some(output => output.keyId === "legacy-canvas")).toBe(false);
    expect(await (await fixture.request("/management/overlay-outputs/legacy-keys")).json()).toEqual([{ keyId: "legacy-canvas", moduleId: "alerts", createdAt: "2026-10-11T00:00:00Z" }]);
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
