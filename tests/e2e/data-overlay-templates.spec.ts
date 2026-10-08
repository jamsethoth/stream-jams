import { dataOverlayStateSchema, dataTemplateCatalogSchema, type DataOverlayState, type DataTemplate } from "@stream-jams/core";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";
test.use({ trace: "off", screenshot: "off", video: "off" });
type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
async function getState(fixture: Fixture) { return dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json()); }
async function createFromTemplate(page: Page, template: DataTemplate, prefix: string) {
  await page.getByRole("button", { name: "Create from template" }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Template", { exact: true }).selectOption(template.id);
  await dialog.getByLabel("Template canvas name").fill(prefix);
  for (const slot of template.slots) {
    await dialog.getByRole("textbox", { name: `${slot.name} value name`, exact: true }).fill(`${prefix} ${slot.name}`);
    if (slot.kind === "goal") await dialog.getByRole("textbox", { name: `${slot.name} goal name`, exact: true }).fill(`${prefix} ${slot.name} goal`);
  }
  await dialog.getByRole("button", { name: "Create disabled canvas" }).click(); await expect(page.getByRole("heading", { name: `Canvas: ${prefix}`, exact: true })).toBeVisible();
}
test("all four starters work with new custom values/goals; saved reuse and insertion preserve independent copies", async ({ page }) => {
  test.setTimeout(120000); const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start(); await page.goto(`${fixture.runtime.url}/manage/modules/data-overlays`);
    const catalog = dataTemplateCatalogSchema.parse(await (await fixture.request("/data-overlays/templates")).json());
    expect(catalog.templates.map(template => template.id).sort()).toEqual(["combined-goals-panel", "counter-badge", "goal-bar", "latest-supporter"]);
    for (const template of catalog.templates) {
      await createFromTemplate(page, template, `Created ${template.id}`);
      const state = await getState(fixture); const canvas = state.canvases.find(item => item.name === `Created ${template.id}`)!;
      expect(canvas.enabled).toBe(false); expect(canvas.elements.length).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Back to canvases" }).click();
    }
    await page.getByRole("button", { name: "Edit Created counter-badge", exact: true }).click();
    await page.getByRole("button", { name: "Save as template", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Saved template name").fill("Saved badge"); await page.getByRole("dialog").getByRole("button", { name: "Save template", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const savedCatalog = dataTemplateCatalogSchema.parse(await (await fixture.request("/data-overlays/templates")).json()); const saved = savedCatalog.templates.find(template => template.name === "Saved badge")!;
    expect(saved.origin).toBe("user"); const before = await getState(fixture); const original = before.canvases.find(canvas => canvas.name === "Created counter-badge")!;
    await page.getByRole("button", { name: "Back to canvases" }).click(); await createFromTemplate(page, saved, "Reused badge");
    const reused = (await getState(fixture)).canvases.find(canvas => canvas.name === "Reused badge")!;
    expect(reused.id).not.toBe(original.id); expect(reused.elements.map(element => element.id).some(id => original.elements.some(element => element.id === id))).toBe(false);
    // Dirty edits are retained until an explicit save; canceling insertion creates no data.
    await page.getByRole("button", { name: "Add rectangle" }).click(); await page.getByRole("button", { name: "Insert template", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Save canvas before using templates")).toBeVisible(); await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    expect((await getState(fixture)).canvases.find(canvas => canvas.id === reused.id)?.elements).toEqual(reused.elements);
    await page.getByRole("button", { name: "Insert template", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Save canvas and continue" }).click();
    const dialog = page.getByRole("dialog"); await dialog.getByLabel("Template", { exact: true }).selectOption(saved.id);
    for (const slot of saved.slots) await dialog.getByLabel(`Map ${slot.name}`, { exact: true }).selectOption(`value:${before.values.find(value => value.name.startsWith("Created counter-badge"))!.id}`);
    await dialog.getByRole("button", { name: "Insert independent layers" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
    const inserted = await getState(fixture); expect(inserted.canvases.find(canvas => canvas.id === reused.id)!.elements).toHaveLength(reused.elements.length + 1 + saved.elements.length);
    expect(inserted.canvases.find(canvas => canvas.id === original.id)).toEqual(original);
  } finally { await fixture.close(); }
});

test("removed template image becomes identifiable hidden placeholder and can be replaced in the editor", async ({ page }) => {
  test.setTimeout(90000); const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const bytes = await readFile(resolve("apps/web/public/storybook-assets/tiny-image.png"));
    const upload = await fetch(`${fixture.runtime.url}/assets/import`, { method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "template.png", "x-stream-jams-mime-type": "image/png" }, body: bytes }); expect(upload.status).toBe(201); const image = await upload.json() as { id: string };
    const created = dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays/canvases", "POST", { name: "Image original", enabled: false, order: 0, targetProfileId: "landscape", outputs: { browser: true, desktop: false }, elements: [{ id: "image-layer", kind: "image", assetId: image.id, fit: "contain", order: 0, x: 0, y: 0, width: 80, height: 80, visible: true, stalePolicy: "retain-last" }] })).json());
    const canvas = created.canvases[0]!; const catalog = dataTemplateCatalogSchema.parse(await (await fixture.request("/data-overlays/templates/save", "POST", { name: "Image layout", canvasId: canvas.id })).json()); const template = catalog.templates.find(item => item.name === "Image layout")!;
    expect((await fixture.request(`/data-overlays/canvases/${canvas.id}`, "DELETE")).status).toBe(200);
    expect((await fixture.request(`/management/assets/${image.id}`, "DELETE")).status).toBe(204);
    const state: DataOverlayState = dataOverlayStateSchema.parse(await (await fixture.request(`/data-overlays/templates/${template.id}/instantiate`, "POST", { name: "Missing image canvas", enabled: false, order: 0, outputs: { browser: true, desktop: false }, mappings: [] })).json());
    expect(state.canvases[0]!.elements[0]).toMatchObject({ kind: "missing-image", sourceAssetId: image.id });
    await page.goto(`${fixture.runtime.url}/manage/modules/data-overlays`); await page.getByRole("button", { name: "Edit Missing image canvas" }).click(); await page.getByRole("button", { name: "missing-image · 0" }).click();
    await expect(page.getByRole("status")).toContainText(image.id);
    // Upload a fresh registered image into this disposable service, then reload the editor library.
    const replacement = await fetch(`${fixture.runtime.url}/assets/import`, { method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "replacement.png", "x-stream-jams-mime-type": "image/png" }, body: bytes }); expect(replacement.status).toBe(201);
    await page.reload(); await page.getByRole("button", { name: "Edit Missing image canvas" }).click(); await page.getByRole("button", { name: "missing-image · 0" }).click(); await page.getByRole("button", { name: "Choose local image" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /replacement/u }).first().click(); await page.getByRole("dialog").getByRole("button", { name: "Use selected asset" }).click(); await page.getByRole("button", { name: "Save canvas", exact: true }).click();
    await expect.poll(async () => (await getState(fixture)).canvases[0]!.elements[0]!.kind).toBe("image");
  } finally { await fixture.close(); }
});
