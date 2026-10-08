import { dataOverlayStateSchema, surfaceSettingsViewSchema, type DataOverlayState, type OverlayModuleSnapshot, type OverlayOutputKeyResult } from "@stream-jams/core";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
async function seed(fixture: Fixture) {
  async function mutate(path: string, body: unknown, method = "POST") {
    const response = await fixture.request(path, method, body); expect(response.status).toBe(method === "POST" ? 201 : 200);
    return dataOverlayStateSchema.parse(await response.json());
  }
  let state = await mutate("/data-overlays/groups", { name: "Session" }); const group = state.resetGroups[0]!;
  state = await mutate("/data-overlays/values", { name: "Count", kind: "integer", resetDefault: 4, resetGroupId: group.id }); const counter = state.values[0]!;
  await mutate("/data-overlays/values", { name: "Label", kind: "text", resetDefault: "Plain label", resetGroupId: group.id });
  await mutate("/data-overlays/values", { name: "Second count", kind: "integer", resetDefault: 0, resetGroupId: null });
  state = await mutate("/data-overlays/goals", { name: "Session goal", valueId: counter.id, mode: "saved-baseline", baseline: 4, additionalAmount: 10 }); const goal = state.goals[0]!;
  await mutate("/data-overlays/pins", { valueIds: state.values.map(value => value.id) }, "PUT");
  const geometry = { order: 0, x: 40, y: 40, width: 300, height: 80, visible: true, stalePolicy: "retain-last" };
  const elements = [{ ...geometry, id: "counter_text", kind: "text", binding: { kind: "value", valueId: counter.id }, literalText: "", format: { thousandsSeparator: true, prefix: "Count ", suffix: "", overflow: "wrap" }, style: { fontSizePx: 40, color: "#ffffffff", fontWeight: 400, align: "left" } },
    { ...geometry, id: "progress", kind: "progress", y: 140, goalId: goal.id, orientation: "horizontal", direction: "forward", fillColor: "#00ff00ff", backgroundColor: "#000000ff", borderColor: "#ffffffff", borderWidthPx: 1 }];
  for (const [order, name] of ["First canvas", "Second canvas"].entries()) await mutate("/data-overlays/canvases", { name, enabled: true, order, targetProfileId: "landscape", outputs: { browser: true, desktop: true }, elements });
  expect((await fixture.request("/overlay-modules/data-overlays/enabled", "PATCH", { enabled: true })).status).toBe(200);
  const response = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "module", moduleId: "data-overlays", purpose: "live", targetProfileId: "landscape" }); expect(response.status).toBe(200);
  const key = await response.json() as OverlayOutputKeyResult;
  return { state, counter, group, goal, outputUrl: new URL(key.url, fixture.runtime.url).toString() };
}
async function state(fixture: Fixture): Promise<DataOverlayState> { return dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json()); }
async function privateRenderer(page: Page, fixture: Fixture) {
  const root = resolve("apps/web/dist-desktop-overlay");
  await page.route("**/_disposable-private/**", async route => {
    const file = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (!["desktop-overlay.html", "overlay.js", "overlay.css"].includes(file)) return route.abort();
    await route.fulfill({ body: await readFile(resolve(root, file)), contentType: file.endsWith("js") ? "text/javascript" : file.endsWith("css") ? "text/css" : "text/html" });
  });
  await page.addInitScript(() => {
    const target = window as unknown as { streamJamsOverlayHost: unknown; fixtureCommand?: (value: unknown) => void; fixtureReports: unknown[] };
    target.fixtureReports = [];
    target.streamJamsOverlayHost = { onCommand(callback: (value: unknown) => void) { target.fixtureCommand = callback; return () => {}; }, report(reply: unknown) { target.fixtureReports.push(reply); } };
  });
  await page.goto(`${fixture.runtime.url}/_disposable-private/desktop-overlay.html`);
  await page.waitForFunction(() => typeof (window as unknown as { fixtureCommand?: unknown }).fixtureCommand === "function");
  await page.evaluate(command => (window as unknown as { fixtureCommand(value: unknown): void }).fixtureCommand(command), { protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command: { type: "configure", config: { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "disposable-display", displayLabel: "Disposable", autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: "data-overlays", visible: true }] } } });
  let revision = 0;
  return async () => {
    const snapshot: OverlayModuleSnapshot = await fixture.runtime.composition.dataOutputRuntime.getModuleSnapshot({ overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape" });
    await page.evaluate(command => (window as unknown as { fixtureCommand(value: unknown): void }).fixtureCommand(command), { protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command: { type: "sync-module", moduleId: "data-overlays", revision: ++revision, presentation: snapshot.presentation, assets: [] } });
  };
}
test("disposable Operator commits reach both canvases, browser and private renderer, with conflict and reset safety", async ({ page, context }) => {
  test.setTimeout(120000); const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start(); expect((await fixture.request("/health")).status).toBe(200); const seeded = await seed(fixture);
    const browser = await context.newPage(); await browser.goto(seeded.outputUrl);
    await expect(browser.getByText("Count 4", { exact: true })).toHaveCount(2);
    const unifiedKey = await (await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "unified", moduleId: null, purpose: "live" })).json() as OverlayOutputKeyResult;
    const surfaces = surfaceSettingsViewSchema.parse(await (await fixture.request("/overlay-surfaces")).json());
    const surface = surfaces.surfaces.find(surface => surface.kind === "unified-browser")!;
    expect((await fixture.request(`/overlay-surfaces/${encodeURIComponent(surface.id)}`, "PUT", { ...surface, layers: surface.layers.some(layer => layer.moduleId === "data-overlays") ? surface.layers.map(layer => layer.moduleId === "data-overlays" ? { ...layer, visible: true } : layer) : [...surface.layers, { moduleId: "data-overlays", visible: true }] })).status).toBe(200);
    const unified = await context.newPage(); await unified.goto(new URL(unifiedKey.url, fixture.runtime.url).toString()); await expect(unified.getByText("Count 4", { exact: true })).toHaveCount(2);
    const desktop = await context.newPage(); const syncDesktop = await privateRenderer(desktop, fixture); await syncDesktop();
    await expect(desktop.getByText("Count 4", { exact: true })).toHaveCount(2);
    await page.setViewportSize({ width: 540, height: 960 }); await page.goto(`${fixture.runtime.url}/operator`);
    const data = page.getByRole("region", { name: "Data", exact: true }); await expect(data.getByText("Current: 4", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await data.getByRole("button", { name: "Add one to Count", exact: true }).click(); await expect(data.getByText("Current: 5", { exact: true })).toBeVisible();
    await expect(browser.getByText("Count 5", { exact: true })).toHaveCount(2); await syncDesktop(); await expect(desktop.getByText("Count 5", { exact: true })).toHaveCount(2);
    await expect(unified.getByText("Count 5", { exact: true })).toHaveCount(2); await browser.reload(); await expect(browser.getByText("Count 5", { exact: true })).toHaveCount(2);
    await data.getByRole("button", { name: "Reset Count", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    expect((await state(fixture)).values.find(value => value.id === seeded.counter.id)?.content).toBe(5);
    // The live mutation occurs after the UI submits its revision: a real service conflict.
    await page.route(`**/operator/data-overlays/values/${seeded.counter.id}/set`, async route => {
      await fixture.request(`/operator/data-overlays/values/${seeded.counter.id}/add`, "POST", { amount: 1 }); await route.continue();
    }, { times: 1 });
    await data.getByRole("spinbutton", { name: "Set Count", exact: true }).fill("20"); await data.getByRole("button", { name: "Set Count", exact: true }).click();
    await expect(data.getByText("Current: 6", { exact: true })).toBeVisible(); await expect(data.getByRole("spinbutton", { name: "Set Count", exact: true })).toHaveValue("20"); await expect(data.getByRole("alert")).toContainText("revision");
    await data.getByRole("button", { name: "Set Count", exact: true }).click(); await expect(data.getByText("Current: 20", { exact: true })).toBeVisible();
    await expect(browser.getByText("Count 20", { exact: true })).toHaveCount(2);
    await data.getByRole("button", { name: "Hide First canvas", exact: true }).click(); await expect(browser.getByText("Count 20", { exact: true })).toHaveCount(1); await syncDesktop(); await expect(desktop.getByText("Count 20", { exact: true })).toHaveCount(1);
    await data.getByRole("button", { name: "Show First canvas", exact: true }).click(); await expect(browser.getByText("Count 20", { exact: true })).toHaveCount(2);
    await data.getByRole("button", { name: "Reset group Session", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await expect(data.getByText("Current: 4", { exact: true })).toBeVisible(); expect((await state(fixture)).goals[0]).toMatchObject({ baseline: 4 });
    expect((await fixture.request(`/data-overlays/values/${seeded.counter.id}`, "DELETE")).status).toBe(409);
    const beforeRestart = await state(fixture); await browser.close(); await unified.close(); await desktop.close(); await fixture.stop(); await fixture.start(); expect((await fixture.request("/health")).status).toBe(200);
    expect(await state(fixture)).toEqual(beforeRestart); await page.reload(); await expect(page.getByText("Current: 4", { exact: true })).toBeVisible();
  } finally { await fixture.close(); }
});
test("disposable Management saves definitions and canvas drafts explicitly while sample preview leaves live output unchanged", async ({ page, context }) => {
  test.setTimeout(90000); const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start(); const seeded = await seed(fixture); const browser = await context.newPage(); await browser.goto(seeded.outputUrl); await expect(browser.getByText("Count 4", { exact: true })).toHaveCount(2);
    await page.goto(`${fixture.runtime.url}/manage/data`); await expect(page.getByRole("heading", { name: "Data", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add one to Count" })).toHaveCount(0);
    await page.goto(`${fixture.runtime.url}/manage/modules/data-overlays`); await page.getByRole("button", { name: "Edit First canvas", exact: true }).click();
    await page.getByRole("textbox", { name: "Canvas name", exact: true }).fill("Renamed draft");
    await page.getByRole("button", { name: "completion", exact: true }).click();
    expect((await state(fixture)).values.find(value => value.id === seeded.counter.id)?.content).toBe(4); expect((await state(fixture)).canvases[0]?.name).toBe("First canvas");
    await expect(browser.getByText("Count 4", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Save canvas", exact: true }).click(); await expect.poll(async () => (await state(fixture)).canvases[0]?.name).toBe("Renamed draft");
    await page.getByRole("button", { name: "Back to canvases", exact: true }).click(); await expect(page.getByRole("button", { name: "Edit Renamed draft", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete Renamed draft", exact: true }).click(); await page.getByRole("button", { name: "Confirm delete canvas", exact: true }).click();
    await expect(browser.getByText("Count 4", { exact: true })).toHaveCount(1); expect((await state(fixture)).values.find(value => value.id === seeded.counter.id)?.content).toBe(4);
    await browser.close();
  } finally { await fixture.close(); }
});
