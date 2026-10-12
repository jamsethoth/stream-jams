import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { overlayCompositionSchema, upgradeTimersConfig, type ConfigurationBackupArchive, type ConfigurationRestorePreflight, type ConfigurationRestoreResult, type DesktopModuleSync, type DesktopOverlayTransport, type OverlayOutputView, type SurfaceSettingsView } from "@stream-jams/core";
import { ConfigurationBackupService } from "../../apps/server/src/modules/backup/configuration-backup-service.js";
import { createPreMigrationDatabase } from "../../apps/server/src/test-support/pre-migration-database.js";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
async function checked<T>(response: Response): Promise<T> { expect(response.status, await response.clone().text()).toBe(200); return response.json() as Promise<T>; }
const ordinary = [
  ...["alerts", "music", "timers"].flatMap(moduleId => ["landscape", "vertical"].map(targetProfileId => ({ moduleId, targetProfileId }))),
  { moduleId: "videos", targetProfileId: null }, { moduleId: "screen-effects", targetProfileId: null }
];
async function canvas(url: string) { const endpoint = new URL(url); endpoint.pathname += "/composition"; return overlayCompositionSchema.parse(await checked(await fetch(endpoint))); }
async function outputs(fixture: Fixture) {
  return (await checked<OverlayOutputView[]>(await fixture.request("/management/overlay-outputs"))).filter(output => ordinary.some(choice => choice.moduleId === output.moduleId && choice.targetProfileId === output.targetProfileId)).map(output => {
    if (output.url === null) throw new Error(`Ordinary ${output.moduleId} source has no available URL`);
    return { ...output, url: output.url };
  });
}
async function pinnedTimers() { return (JSON.parse(await readFile("docs/verification/browser-desktop-output-layouts/baseline/saved-configs.json", "utf8")) as { timers: unknown }).timers; }

test("I1 eight ordinary outputs retain empty, disabled and reconnect geometry while desktop placement and a stale bootstrap are independent", async ({ context }) => {
  test.setTimeout(90_000);
  const syncs: DesktopModuleSync[] = [];
  const transport: DesktopOverlayTransport = {
    configure: async () => {}, syncModule: async value => { syncs.push(value); }, prepare: async () => "ready", start: async () => {}, stop: async () => {}, retry: async () => {}, close: async () => {},
    getStatus: async () => ({ available: true, state: "ready", message: null, displays: [{ id: "synthetic", label: "Disposable display", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] })
  };
  const fixture = await createProviderSecurityRuntimeFixture({ desktopOverlayTransport: transport });
  let releaseBootstrap = () => {};
  try {
    await fixture.start();
    for (const choice of ordinary) await checked(await fixture.request("/management/overlay-outputs/keys", "POST", { ...choice, overlayId: "default", purpose: "live", scope: "module" }));
    const listed = await outputs(fixture); expect(listed).toHaveLength(8);
    for (const output of listed) {
      const page = await context.newPage(); const before = await canvas(output.url);
      await page.goto(output.url); await expect(page.getByTestId("overlay-root")).toBeVisible();
      if (before.canvas.kind === "content") {
        await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("width", `${before.canvas.width}px`);
        await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("height", `${before.canvas.height}px`);
        await page.setViewportSize({ width: 320, height: 240 });
        expect(await page.getByTestId("overlay-content-canvas").boundingBox()).toEqual({ x: 0, y: 0, width: before.canvas.width, height: before.canvas.height });
      }
      expect((await fixture.request(`/overlay-modules/${output.moduleId}/enabled`, "PATCH", { enabled: false })).status).toBe(200);
      await page.reload(); const disabled = (await canvas(output.url)).canvas;
      expect({ width: disabled.width, height: disabled.height, kind: disabled.kind }).toEqual({ width: before.canvas.width, height: before.canvas.height, kind: before.canvas.kind });
      expect(disabled.configRevision).toBeGreaterThanOrEqual(before.canvas.configRevision);
      await expect(page.getByTestId("overlay-root")).toBeVisible(); await page.close();
    }
    const music = await checked<{ config: Record<string, unknown> }>(await fixture.request("/overlay-modules/music/config"));
    const musicOutputs = listed.filter(output => output.moduleId === "music");
    const prior = await Promise.all(musicOutputs.map(output => canvas(output.url)));
    const surface = (await checked<SurfaceSettingsView>(await fixture.request("/overlay-surfaces"))).surfaces.find(value => value.kind === "desktop")!;
    await checked(await fixture.request(`/overlay-surfaces/${encodeURIComponent(surface.id)}`, "PUT", { id: surface.id, kind: "desktop", enabled: true, displayId: "synthetic", autoFollowDisplayName: false, opacity: 1, layers: surface.layers.map(layer => ({ ...layer, visible: true })) }));
    await checked(await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: { ...music.config, desktopPlacement: { full: { x: 104, y: 117 }, compact: null }, desktopScale: { full: 1.1, compact: 1 } } }));
    for (const [index, output] of musicOutputs.entries()) { const after = await canvas(output.url); expect(after.canvas.width).toBe(prior[index]!.canvas.width); expect(after.canvas.height).toBe(prior[index]!.canvas.height); }
    const timerOutput = listed.find(output => output.moduleId === "timers" && output.targetProfileId === "landscape")!;
    const racing = await context.newPage(); let release!: () => void; let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; releaseBootstrap = resolve; }); const entering = new Promise<void>(resolve => { entered = resolve; });
    await racing.route("**/composition?*", async route => { const response = await route.fetch(); entered(); await blocked; await route.fulfill({ response }); });
    const navigation = racing.goto(timerOutput.url); await entering;
    const saved = upgradeTimersConfig(await pinnedTimers());
    await checked(await fixture.request("/overlay-modules/timers/config", "PUT", { enabled: true, config: saved }));
    const current = await canvas(timerOutput.url); release(); await navigation;
    const definition = await fixture.request("/timers", "POST", { label: "Silent integrated timer", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } });
    expect(definition.status).toBe(201); const timer = await definition.json() as { id: string };
    await checked(await fixture.request(`/timers/${timer.id}/start`, "POST")); await checked(await fixture.request(`/timers/${timer.id}/pause`, "POST"));
    await expect.poll(() => syncs.some(sync => sync.moduleId === "timers" && sync.presentation?.kind === "timer-stack")).toBe(true);
    await expect(racing.getByTestId("overlay-content-canvas")).toHaveCSS("width", `${current.canvas.width}px`);
    await expect(racing.getByTestId("overlay-content-canvas")).toHaveCSS("height", `${current.canvas.height}px`);
    await expect(racing.getByText("Silent integrated timer")).toBeVisible();
    const pixels = await racing.getByTestId("overlay-content-canvas").screenshot({ animations: "disabled", omitBackground: true });
    const moved = { ...saved, profiles: { ...saved.profiles, landscape: { ...saved.profiles.landscape, desktopPlacement: { x: 10, y: 20, zIndex: 0, scale: 0.5 } } } };
    await checked(await fixture.request("/overlay-modules/timers/config", "PUT", { enabled: true, config: moved }));
    const afterMove = await canvas(timerOutput.url); expect(afterMove.canvas.configRevision).toBeGreaterThan(current.canvas.configRevision);
    expect({ width: afterMove.canvas.width, height: afterMove.canvas.height }).toEqual({ width: current.canvas.width, height: current.canvas.height });
    expect((await racing.getByTestId("overlay-content-canvas").screenshot({ animations: "disabled", omitBackground: true })).equals(pixels)).toBe(true);
    await racing.unroute("**/composition?*"); await racing.reload(); expect((await canvas(timerOutput.url)).canvas).toEqual(afterMove.canvas);
  } finally { releaseBootstrap(); await fixture.close(); }
});

test("I2 mixed provenance and independent consumer outcomes retain one queued Video admission", async () => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start(); const runtime = fixture.runtime.composition; const db = runtime.database.connection;
    const event = { type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: "synthetic-viewer", displayName: "Synthetic viewer" }, amount: null, message: null, metadata: {} };
    const subscribed = { ...event, id: "s11-subscribed", occurredAt: new Date().toISOString() };
    expect((await runtime.eventIngestionService.ingestNormalizedEvent(subscribed)).status).toBe("accepted");
    expect((await runtime.eventIngestionService.ingestNormalizedEvent(subscribed)).status).toBe("duplicate");
    const receipts: { busId: string; eventId: string; consumers: { consumerId: string; outcome: string }[] }[] = [];
    for (let index = 0; index < 2; index++) receipts.push(await checked(await fixture.request("/management/events/manual", "POST", { action: { kind: "simulate-canonical", event } })));
    expect(receipts[0]!.busId).not.toBe(receipts[1]!.busId); expect(receipts[0]!.eventId).not.toBe(receipts[1]!.eventId);
    for (const receipt of receipts) expect(receipt.consumers.map(value => value.consumerId).sort()).toEqual(["alerts", "screen-effects", "timers", "twitch-data-sources", "videos"]);
    const rows = db.prepare("SELECT source_kind,source_registration_id,correlation_key FROM event_bus_journal ORDER BY sequence").all();
    expect(rows).toHaveLength(3); expect(rows[0]!.source_kind).toBe("twitch");
    expect(rows.slice(1)).toEqual([{ source_kind: "manual", source_registration_id: null, correlation_key: null }, { source_kind: "manual", source_registration_id: null, correlation_key: null }]);
    const forged = await fixture.request("/management/events/manual", "POST", { action: { kind: "simulate-canonical", event: { ...event, sourceRegistrationId: "forged" } } }); expect(forged.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) n FROM event_bus_journal").get()?.n).toBe(3);
    expect((await fixture.request("/overlay-modules/videos/enabled", "PATCH", { enabled: true })).status).toBe(200);
    const video = await fixture.request("/videos/live/requests", "POST", { link: "https://youtu.be/dQw4w9WgXcQ", title: "Synthetic mixed admission", autoplay: false }); expect(video.status).toBe(201);
    const accepted = await video.json() as { busId: string };
    const receipt = await checked<{ item: { submittedVia: string; status: string } }>(await fixture.request(`/videos/live/submissions/${encodeURIComponent(accepted.busId)}`));
    expect(receipt.item).toMatchObject({ submittedVia: "management", status: "queued" });
    expect(db.prepare("SELECT COUNT(*) n FROM video_requests").get()?.n).toBe(1); expect(db.prepare("SELECT COUNT(*) n FROM video_bus_admissions").get()?.n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) n FROM event_bus_journal").get()?.n).toBe(4);
  } finally { await fixture.close(); }
});

test("I3 actual old Timer database upgrades once and legacy/current portable restores retain geometry while regenerating ordinary keys", async () => {
  test.setTimeout(90_000); const fixture = await createProviderSecurityRuntimeFixture(); const legacy = await pinnedTimers(); const expected = upgradeTimersConfig(legacy);
  try {
    using old = createPreMigrationDatabase("044-timer-profile-appearance");
    old.connection.prepare("INSERT INTO overlay_module_config VALUES ('timers',1,?,'2026-10-10T00:00:00Z')").run(JSON.stringify(legacy));
    const raw = "ovl_s11_disposable_timer"; const hash = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
    old.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,created_at,target_profile_id) VALUES ('s11-preserved','default','timers','live','module',?,'2026-10-10T00:00:00Z','landscape')").run(hash);
    await mkdir(join(fixture.homeDirectory, ".stream-jams", "data"), { recursive: true }); old.connection.prepare("VACUUM INTO ?").run(join(fixture.homeDirectory, ".stream-jams", "data", "stream-jams.sqlite"));
    await fixture.start();
    expect((await checked<{ config: unknown }>(await fixture.request("/overlay-modules/timers/config"))).config).toEqual(expected);
    expect(fixture.runtime.composition.database.connection.prepare("SELECT key_hash FROM overlay_keys WHERE id='s11-preserved'").get()?.key_hash).toBe(hash);
    await fixture.stop(); await fixture.start(); expect((await checked<{ config: unknown }>(await fixture.request("/overlay-modules/timers/config"))).config).toEqual(expected);
    for (const kind of ["legacy", "current"] as const) {
      await checked(await fixture.request("/management/alert-sets"));
      const archive = await checked<ConfigurationBackupArchive>(await fixture.request("/management/settings/backup"));
      const identities = archive.configuration.overlayOutputs.map(({ moduleId, targetProfileId, purpose, scope }) => ({ moduleId, targetProfileId, purpose, scope }));
      if (kind === "legacy") { archive.manifest.schemaVersion = 43; archive.configuration.tables.overlay_module_config!.find(row => row.module_id === "timers")!.config_json = JSON.stringify(legacy); archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration); }
      const preflight = await checked<ConfigurationRestorePreflight>(await fixture.request("/management/settings/backup/preflight", "POST", archive)); expect(preflight.state, JSON.stringify(preflight.blockers)).toBe("valid");
      const result = await checked<ConfigurationRestoreResult>(await fixture.request("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true }));
      expect(result.regeneratedOutputs).toHaveLength(identities.length); await fixture.stop(); await fixture.start();
      const exported = await checked<ConfigurationBackupArchive>(await fixture.request("/management/settings/backup"));
      expect(exported.configuration.overlayOutputs.map(({ moduleId, targetProfileId, purpose, scope }) => ({ moduleId, targetProfileId, purpose, scope }))).toEqual(identities);
      expect((await checked<{ config: unknown }>(await fixture.request("/overlay-modules/timers/config"))).config).toEqual(expected);
      const desktop = (await checked<SurfaceSettingsView>(await fixture.request("/overlay-surfaces"))).surfaces.find(value => value.kind === "desktop")!; expect(desktop).toMatchObject({ enabled: false, displayId: null, autoFollowDisplayName: false });
      const endpoint = new URL(`/overlay/modules/timers/live/${raw}/composition?profile=landscape`, fixture.runtime.url); expect((await fetch(endpoint)).status).toBe(401);
    }
  } finally { await fixture.close(); }
});
