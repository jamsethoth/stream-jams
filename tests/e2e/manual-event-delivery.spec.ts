import { expect, test, type Page } from "@playwright/test";
import { alertEditorDocumentSchema, type AlertSetDetail, type AlertSetOverview, type DesktopOverlayTransport, type DesktopVisualBatch, type SurfaceSettingsView, type VisualRecipientKey } from "@stream-jams/core";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test("local_preview_never_publishes; manual sends journal once to ordinary browser and private desktop, with unavailable output correction", async ({ page }) => {
  test.setTimeout(90_000);
  const prepared: DesktopVisualBatch[] = [];
  const started: VisualRecipientKey[] = [];
  const transport: DesktopOverlayTransport = {
    configure: async () => {}, syncModule: async () => {}, prepare: async batch => { prepared.push(batch); return "ready"; },
    start: async key => { started.push(key); }, stop: async () => {}, retry: async () => {}, close: async () => {},
    getStatus: async () => ({ available: true, displays: [{ id: "fixture-monitor", label: "Disposable monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], state: "ready", message: null })
  };
  const fixture = await createProviderSecurityRuntimeFixture({ desktopOverlayTransport: transport });
  let overlay: Page | undefined;
  try {
    await fixture.start();
    const runtime = fixture.runtime.composition;
    const head = () => Number((runtime.database.connection.prepare("SELECT COALESCE(MAX(sequence), 0) AS head FROM event_bus_journal").get() as { head: number }).head);
    const sets = await (await fixture.request("/management/alert-sets")).json() as AlertSetOverview[];
    const set = await (await fixture.request(`/management/alert-sets/${sets[0]!.id}`)).json() as AlertSetDetail;
    const alertId = set.inventory.find(alert => alert.eventType === "follow" && alert.kind === "default")!.id;
    const original = alertEditorDocumentSchema.parse(await (await fixture.request(`/management/alerts/${alertId}/editor`)).json());
    const document = alertEditorDocumentSchema.parse({ ...original, enabled: true, durationMode: "custom", durationMs: 5000, layers: [{ id: "fixture-text", name: "Message", type: "text", visible: true, order: 0, template: "Thanks, {userName}!", animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 0, delayMs: 0, easing: "linear" } }], outputs: { browserSource: false, deviceRouteIds: [] }, targetProfiles: original.targetProfiles.map(profile => ({ ...profile, enabled: profile.id === "landscape", reviewState: "ready", layerLayouts: [{ layerId: "fixture-text", x: 500, y: 400, width: 800, height: 200, zIndex: 0 }] })) });
    expect((await fixture.request(`/management/alerts/${alertId}/editor`, "PUT", { document, confirmLiveImpact: true })).status).toBe(200);
    expect((await fixture.request("/overlay-modules/alerts/enabled", "PATCH", { enabled: true })).status).toBe(200);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(`${fixture.runtime.url}/manage/modules/alerts/editor/${alertId}`);
    const beforePreview = head();
    const forgedSaved = await fixture.request(`/management/alerts/${alertId}/editor/test-saved`, "POST", { alertId: "forged", targetProfileId: "landscape", samplePayload: {}, includeAudio: false, includeTts: false });
    expect(forgedSaved.status).toBe(400);
    expect(head()).toBe(beforePreview);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByText("Preview playing", { exact: true })).toBeVisible();
    expect(head()).toBe(beforePreview);
    expect(runtime.playbackCoordinator.getSnapshot().current).toBeNull();
    const samplePayload = document.samplePayloads[0]!.payload;
    const testRequest = { document, targetProfileId: "landscape", samplePayload, includeAudio: false, includeTts: false };
    const invalid = await fixture.request(`/management/alerts/${alertId}/editor/test`, "POST", { ...testRequest, document: { ...document, layers: [...document.layers, { id: "missing", name: "Missing", type: "audio", visible: true, order: 100, assetId: "missing-asset", volume: 0, animation: document.layers[0]!.animation }] }, includeAudio: true });
    expect(invalid.status).toBe(422);
    expect(head()).toBe(beforePreview);
    const unavailable = await fixture.request(`/management/alerts/${alertId}/editor/test`, "POST", testRequest);
    expect(unavailable.status).toBe(409);
    expect(head()).toBe(beforePreview + 1);
    expect(runtime.playbackCoordinator.getSnapshot().current).toBeNull();
    const outputResponse = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "alerts", targetProfileId: "landscape", purpose: "live", scope: "module" });
    expect(outputResponse.status).toBe(200);
    const output = await outputResponse.json() as { url: string };
    overlay = await page.context().newPage();
    const connected = overlay.waitForEvent("websocket").then(socket => socket.waitForEvent("framereceived"));
    await overlay.goto(output.url); await connected;
    const view = await (await fixture.request("/overlay-surfaces")).json() as SurfaceSettingsView;
    const desktop = view.surfaces.find(surface => surface.kind === "desktop")!;
    const saveDesktop = await fixture.request(`/overlay-surfaces/${desktop.id}`, "PUT", { id: desktop.id, kind: "desktop", enabled: true, displayId: "fixture-monitor", autoFollowDisplayName: false, opacity: 1, layers: desktop.layers.map(layer => layer.moduleId === "alerts" ? { ...layer, visible: true } : layer) });
    expect(saveDesktop.status).toBe(200);
    await page.getByRole("button", { name: "Test draft", exact: true }).click();
    await expect(page.getByText(/Test queued on Landscape Browser Source, Desktop Overlay/u)).toBeVisible();
    expect(head()).toBe(beforePreview + 2);
    await expect(overlay.getByTestId("overlay-module-alerts")).not.toBeEmpty();
    await expect.poll(() => started.length).toBe(1);
    const item = runtime.playbackCoordinator.getSnapshot().current!;
    expect(item.deliveredBy).toBe("manual");
    expect(prepared[0]?.key.occurrenceId).toBe(JSON.stringify(["alerts", item.id]));
    expect(started[0]?.occurrenceId).toBe(JSON.stringify(["alerts", item.id]));
    expect(prepared[0]?.instructions.every(instruction => instruction.audio === null && instruction.tts === null)).toBe(true);
    await runtime.playbackCoordinator.skipCurrent();
    await page.goto(`${fixture.runtime.url}/manage/modules/alerts`);
    const savedResponse = page.waitForResponse(response => response.url().endsWith(`/management/alerts/${alertId}/editor/test-saved`) && response.request().method() === "POST");
    await page.getByRole("button", { name: `Test saved ${document.name}`, exact: true }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toEqual({ targetProfileId: "landscape", samplePayload, includeAudio: true, includeTts: true });
    expect(saved.request().postDataJSON()).not.toHaveProperty("document");
    expect(await saved.json()).toMatchObject({ status: "queued", busId: expect.any(String), eventId: expect.any(String) });
    expect(head()).toBe(beforePreview + 3);
    const action = runtime.database.connection.prepare("SELECT payload_json FROM event_bus_journal ORDER BY sequence DESC LIMIT 1").get() as { payload_json: string };
    expect(JSON.parse(action.payload_json)).toMatchObject({ action: { kind: "alert-saved-test", alertId } });
  } finally { await overlay?.close(); await fixture.close(); }
});
