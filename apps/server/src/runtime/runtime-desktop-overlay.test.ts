import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument,
  type AlertRule,
  type AppConfig,
  type DesktopOverlayTransport,
  type SurfaceSettingsView
} from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { afterEach, expect, it, vi } from "vitest";
import { createRuntimeAppComposition, type RuntimeAppComposition } from "./runtime-composition.js";
import { DesktopModuleSnapshotSink } from "../modules/overlay-surfaces/desktop-module-snapshot-sink.js";

const roots: string[] = [];
const runtimes: RuntimeAppComposition[] = [];
const testLayerAnimation = {
  mode: "preset" as const,
  entrance: "none",
  exit: "none",
  durationMs: 0,
  delayMs: 0,
  easing: "linear"
};
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.close()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function setup(withMedia = false) {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-visual-runtime-"));
  roots.push(root);
  const webBuildDirectory = join(root, "web-dist");
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"));
  await writeFile(join(webBuildDirectory, "assets", "index.js"), "");
  await writeFile(join(webBuildDirectory, ".vite", "manifest.json"), JSON.stringify({ "index.html": { file: "assets/index.js", isEntry: true } }));
  const config: AppConfig = {
    desktop: { closeToTray: true, gpuAcceleration: true }, server: { host: "127.0.0.1", port: 39187 },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    logging: { level: "INFO", rollover: "hourly", retentionHours: 48 },
    playback: { paused: false, muted: false, doNotDisturb: false }
  };
  const transport = {
    configure: vi.fn<DesktopOverlayTransport["configure"]>(async () => {}),
    syncModule: vi.fn<DesktopOverlayTransport["syncModule"]>(async () => {}),
    prepare: vi.fn<DesktopOverlayTransport["prepare"]>(async () => "ready"),
    start: vi.fn<DesktopOverlayTransport["start"]>(async () => {}),
    stop: vi.fn<DesktopOverlayTransport["stop"]>(async () => {}),
    retry: vi.fn(async () => {}), close: vi.fn(async () => {}),
    getStatus: vi.fn(async () => ({ available: true, state: "ready" as const, message: null,
      displays: [{ id: "monitor", label: "Test monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] }))
  };
  const runtime = await createRuntimeAppComposition({
    homeDirectory: root, webBuildDirectory, configStore: { readConfig: async () => config, updateConfig: async () => { throw new Error("Unexpected config update"); } },
    environment: {}, secretStore: new InMemorySecretStore(), desktopOverlayTransport: transport,
    twitchEventSubSocketFactory: () => { throw new Error("No external Twitch sockets permitted"); },
    scheduleRecurring: () => ({}), cancelRecurring: () => {}
  });
  runtimes.push(runtime);
  const session = (await runtime.app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  const home = await runtime.app.inject({ method: "GET", url: "/management/home", headers });
  expect(home.json()).toMatchObject({ activeAlertSet: { active: true } });
  const rules = (await runtime.app.inject({ method: "GET", url: "/alerts/rules", headers })).json() as AlertRule[];
  const rule = rules.find(candidate => candidate.eventType === "follow")!;
  const document = (await runtime.app.inject({ method: "GET", url: `/management/alerts/${rule.id}/editor`, headers })).json() as AlertEditorDocument;
  const layer = {
    id: `${rule.id}-text`,
    name: "Message",
    type: "text" as const,
    visible: true,
    order: 0,
    animation: testLayerAnimation,
    template: "Desktop {actor.displayName}",
    textStyle: compatibilityAlertTextStyle,
    boxStyle: compatibilityAlertTextBoxStyle
  };
  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  let assetId: string | undefined;
  if (withMedia) {
    const imported = await runtime.app.inject({ method: "POST", url: "/assets/import", headers: {
      ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "pixel.png", "x-stream-jams-mime-type": "image/png"
    }, payload: pngBytes });
    expect(imported.statusCode, imported.body).toBe(201);
    const asset = imported.json() as { id: string; checksum: string };
    expect(asset.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    assetId = asset.id;
  }
  const edited: AlertEditorDocument = {
    ...document, enabled: true,
    layers: [layer, ...(assetId === undefined ? [] : [{
      id: "desktop-image", name: "Imported image", type: "image" as const, visible: true, order: 1, animation: layer.animation, assetId
    }])],
    targetProfiles: document.targetProfiles.map(profile => profile.id === "landscape" ? {
      ...profile, enabled: true, reviewState: "ready",
      layerLayouts: [{ layerId: layer.id, x: 100, y: 120, width: 500, height: 100, zIndex: 2 }, ...(assetId === undefined ? [] : [{ layerId: "desktop-image", x: 0, y: 0, width: 100, height: 100, zIndex: 1 }])]
    } : { ...profile, enabled: false, reviewState: "needs-review" })
  };
  const saved = await runtime.app.inject({ method: "PUT", url: `/management/alerts/${rule.id}/editor`, headers, payload: { document: edited, confirmLiveImpact: true } });
  expect(saved.statusCode, saved.body).toBe(200);
  async function configure(enabled: boolean, visible = true) {
    const settings = (await runtime.app.inject({ method: "GET", url: "/overlay-surfaces", headers })).json() as SurfaceSettingsView;
    const desktop = settings.surfaces.find(surface => surface.kind === "desktop")!;
    const response = await runtime.app.inject({ method: "PUT", url: `/overlay-surfaces/${desktop.id}`, headers, payload: {
      id: desktop.id, kind: desktop.kind, enabled, displayId: "monitor", autoFollowDisplayName: desktop.autoFollowDisplayName,
      opacity: desktop.opacity, layers: desktop.layers.map(entry => ({ ...entry, visible: entry.moduleId === "alerts" ? visible : entry.visible }))
    } });
    expect(response.statusCode, response.body).toBe(200);
  }
  async function ingest(id: string, ingestProvider: "twitch" | "streamerbot" = "twitch") {
    const result = await runtime.eventIngestionService.ingestNormalizedEvent({
      id, providerId: "twitch", sourcePlatform: "twitch", ingestProvider, amount: null,
      occurredAt: new Date().toISOString(), type: "follow", actor: { id: "viewer", displayName: "Viewer" },
      message: null, metadata: {}
    });
    expect(result.status, JSON.stringify(result)).toBe("accepted");
  }
  async function settled() {
    await vi.waitFor(async () => {
      const playback = (await runtime.app.inject({ method: "GET", url: "/playback", headers })).json() as { current: unknown };
      expect(playback.current).toBeNull();
    });
  }
  return { runtime, transport, configure, ingest, settled, assetId, pngBytes };
}

it("returns committed Music saves and enablement despite output failure, then recovers", async () => {
  const { runtime } = await setup();
  const session = (await runtime.app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  const url = "/overlay-modules/music/config";
  const original = (await runtime.app.inject({ url, headers })).json();
  const sink = vi.spyOn(DesktopModuleSnapshotSink.prototype, "syncMusic").mockRejectedValue(new Error("desktop renderer unavailable"));
  try {
    const saved = await runtime.app.inject({ method: "PUT", url, headers, payload: { enabled: true, config: original.config } });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ enabled: true, config: original.config });
    const disabled = await runtime.app.inject({ method: "PATCH", url: "/overlay-modules/music/enabled", headers, payload: { enabled: false } });
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect(disabled.json()).toMatchObject({ enabled: false });
    expect((await runtime.app.inject({ url, headers })).json()).toMatchObject({ enabled: false, config: original.config });
    expect(sink).toHaveBeenCalled();
    sink.mockRestore();
    const recovered = await runtime.app.inject({ method: "PATCH", url: "/overlay-modules/music/enabled", headers, payload: { enabled: true } });
    expect(recovered.statusCode, recovered.body).toBe(200);
  } finally { sink.mockRestore(); }
});

it("coalesces production Music output work while a desktop composition is blocked", async () => {
  const { runtime } = await setup();
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const original = DesktopModuleSnapshotSink.prototype.syncMusic;
  let calls = 0;
  const spy = vi.spyOn(DesktopModuleSnapshotSink.prototype, "syncMusic").mockImplementation(async function (this: DesktopModuleSnapshotSink) {
    calls += 1;
    if (calls === 1) { entered(); await blocked; }
    await original.call(this);
  });
  try {
    const first = runtime.musicRuntimeCoordinator.reconcile();
    await started;
    await Promise.all(Array.from({ length: 30 }, () => runtime.musicRuntimeCoordinator.reconcile()));
    expect(calls).toBe(1);
    release();
    await first;
    await vi.waitFor(() => expect(calls).toBe(2));
  } finally { release(); spy.mockRestore(); }
});

it("bounds rejection observers under many Music revisions and recovers after output failure", async () => {
  const { runtime } = await setup();
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const original = DesktopModuleSnapshotSink.prototype.syncMusic;
  let calls = 0;
  const sink = vi.spyOn(DesktopModuleSnapshotSink.prototype, "syncMusic").mockImplementation(async function (this: DesktopModuleSnapshotSink) {
    calls += 1;
    if (calls === 1) { entered(); await blocked; throw new Error("planned Music output failure"); }
    await original.call(this);
  });
  const reactions = vi.spyOn(Promise.prototype, "catch");
  try {
    await runtime.musicRuntimeCoordinator.reconcile();
    await started;
    reactions.mockClear();
    await Promise.all(Array.from({ length: 300 }, () => runtime.musicRuntimeCoordinator.reconcile()));
    const observers = new Map<unknown, number>();
    for (const promise of reactions.mock.contexts) observers.set(promise, (observers.get(promise) ?? 0) + 1);
    expect(Math.max(0, ...observers.values())).toBeLessThanOrEqual(1);
    expect(calls).toBe(1);
    release();
    await vi.waitFor(() => expect(calls).toBe(2));
    await runtime.musicRuntimeCoordinator.reconcile();
    await vi.waitFor(() => expect(calls).toBe(3));
  } finally { release(); reactions.mockRestore(); sink.mockRestore(); }
});

it.each(["twitch", "streamerbot"] as const)("resolves a saved active reviewed Landscape alert from %s without any OBS client", async provider => {
  const { transport, configure, ingest, settled } = await setup();
  await configure(true);
  expect(transport.prepare).not.toHaveBeenCalled();
  await ingest(`desktop-${provider}`, provider);
  await vi.waitFor(() => expect(transport.start).toHaveBeenCalledOnce());
  expect(transport.prepare).toHaveBeenCalledOnce();
  const batch = transport.prepare.mock.calls[0]![0];
  expect(batch).toMatchObject({ key: { moduleId: "alerts" }, assets: [], instructions: [{
    targetProfileId: "landscape", audio: null, tts: null,
    text: { text: "Desktop Viewer", layout: { x: 100, y: 120, width: 500, height: 100, zIndex: 2 } }
  }] });
  expect(batch.timing.endsAtEpochMs).toBeGreaterThan(batch.timing.startsAtEpochMs);
  expect(batch.deferredStart).toBe(true);
  expect(transport.start).toHaveBeenCalledWith(batch.key, expect.objectContaining({ startsAtEpochMs: expect.any(Number), endsAtEpochMs: expect.any(Number) }));
  await settled();
});

it("dispatches a scoped reference to imported bytes with their persisted checksum", async () => {
  const { runtime, transport, configure, ingest, settled, assetId, pngBytes } = await setup(true);
  transport.prepare.mockImplementationOnce(async batch => {
    const media = await runtime.app.inject({ method: "GET", url: `/media/${batch.assets[0]!.grant.handle}` });
    expect(media.statusCode, media.body).toBe(200);
    expect(media.rawPayload).toEqual(pngBytes);
    return "ready";
  });
  await configure(true);
  await ingest("imported-image");
  await vi.waitFor(() => expect(transport.start).toHaveBeenCalledOnce());
  const batch = transport.prepare.mock.calls[0]![0];
  expect(batch.assets).toEqual([{ assetId, grant: {
    handle: expect.stringMatching(/^med_[A-Za-z0-9_-]{43}$/u), expiresAt: expect.any(Number),
    snapshot: { assetId, version: expect.stringMatching(/^[a-f0-9]{64}$/u), mimeType: "image/png", sizeBytes: pngBytes.length, durationMs: null }
  } }]);
  const grant = batch.assets[0]!.grant;
  expect(batch.instructions).toEqual(expect.arrayContaining([expect.objectContaining({ visual: expect.objectContaining({ assetId, mediaType: "image" }), audio: null, tts: null })]));
  await settled();
  expect((await runtime.app.inject({ method: "GET", url: `/media/${grant.handle}` })).statusCode).toBe(404);
});

it.each(["disabled", "hidden"] as const)("does not dispatch %s output or replay its missed event on enabling", async state => {
  const { transport, configure, ingest, settled } = await setup();
  await configure(state !== "disabled", state !== "hidden");
  await ingest(`missed-${state}`);
  await settled();
  expect(transport.prepare).not.toHaveBeenCalled();
  await configure(true);
  await settled();
  expect(transport.prepare).not.toHaveBeenCalled();
  expect(transport.start).not.toHaveBeenCalled();
});
