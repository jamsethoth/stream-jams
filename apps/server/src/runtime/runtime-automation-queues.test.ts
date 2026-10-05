import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScreenEffectDocument, screenEffectDocumentSchema, normalizedStreamEventSchema, type DesktopOverlayTransport, type SurfaceSettingsView, type ResolvedAlert } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { expect, it } from "vitest";
import { createRuntimeAppComposition } from "./runtime-composition.js";

const allScopes = ["playback:read", ...["alerts", "screen-effects"].flatMap(id => ["pause", "skip", "clear", "mute"].map(action => `playback:${action}:${id}`))];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-automation-queues-"));
  const activeOutputs = new Map<string, () => void>();
  const transport: DesktopOverlayTransport = {
    configure: async () => {}, syncModule: async () => {}, prepare: async () => "ready", start: key => new Promise<void>(resolve => { activeOutputs.set(JSON.stringify(key), resolve); }), stop: async key => { const id = JSON.stringify(key); activeOutputs.get(id)?.(); activeOutputs.delete(id); }, retry: async () => {}, close: async () => { for (const resolve of activeOutputs.values()) resolve(); activeOutputs.clear(); },
    getStatus: async () => ({ available: true, state: "ready", message: null, displays: [{ id: "monitor", label: "Test monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] })
  };
  const runtime = await createRuntimeAppComposition({ homeDirectory: root, webBuildDirectory: await createWebBuildFixture(root), environment: {}, secretStore: new InMemorySecretStore(), desktopOverlayTransport: transport });
  try {
  const app = runtime.app;
  const session = (await app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  const management = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  async function pair(scopes: readonly string[]) {
    const verifier = "a".repeat(43);
    const created = await app.inject({ method: "POST", url: "/automation/v1/pairings", headers: { host: "127.0.0.1:39187" }, payload: { clientName: "Queue acceptance", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url") } });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id as string;
    const approved = await app.inject({ method: "POST", url: `/api/automation/pairings/${id}/approve`, headers: management, payload: { scopes } }); expect(approved.statusCode, approved.body).toBe(200);
    const exchanged = await app.inject({ method: "POST", url: `/automation/v1/pairings/${id}/exchange`, headers: { host: "127.0.0.1:39187" }, payload: { verifier } }); expect(exchanged.statusCode, exchanged.body).toBe(200);
    return { host: "127.0.0.1:39187", authorization: `Bearer ${exchanged.json().token as string}` };
  }
  const machine = await pair(allScopes);
  const read = async () => { const result = await app.inject({ url: "/automation/v1/state", headers: machine }); expect(result.statusCode, result.body).toBe(200); return result.json() as { runtimeId: string; playback: Array<{ moduleId: string; currentOccurrenceId: string | null; queueRevision: string; pendingCount: number; muted: boolean }> }; };
  const runtimeId = (await read()).runtimeId;
  const command = (path: string, input: Record<string, unknown>, headers = machine) => app.inject({ method: "POST", url: `/automation/v1/${path}`, headers, payload: { observedRuntimeId: runtimeId, ...input } });
  const settings = (await app.inject({ url: "/overlay-surfaces", headers: management })).json() as SurfaceSettingsView;
  const desktop = settings.surfaces.find(s => s.kind === "desktop")!;
  const configured = await app.inject({ method: "PUT", url: `/overlay-surfaces/${desktop.id}`, headers: management, payload: { id: desktop.id, kind: desktop.kind, autoFollowDisplayName: desktop.kind === "desktop" ? desktop.autoFollowDisplayName : false, opacity: desktop.kind === "desktop" ? desktop.opacity : 1, enabled: true, displayId: "monitor", layers: desktop.layers.map(layer => ({ ...layer, visible: true })) } }); expect(configured.statusCode, configured.body).toBe(200);
  const enabled = await app.inject({ method: "PATCH", url: "/overlay-modules/screen-effects/enabled", headers: management, payload: { enabled: true } }); expect(enabled.statusCode, enabled.body).toBe(200);
  const imported = await app.inject({ method: "POST", url: "/assets/import", headers: { ...management, "content-type": "application/octet-stream", "x-stream-jams-file-name": "pixel.png", "x-stream-jams-mime-type": "image/png" }, payload: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64") }); expect(imported.statusCode, imported.body).toBe(201);
  const effectId = randomUUID(); const variantId = randomUUID(); const draft = createScreenEffectDocument({ id: effectId, name: "Queue fixture effect", defaultVariantId: variantId });
  const effect = { ...draft, variants: [{ ...draft.variants[0], durationMode: "custom", durationMs: 60000, visual: { mediaType: "image", assetId: imported.json().id as string, layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 } }, visualOutputs: { browserSource: false, desktop: true } }] };
  const created = await app.inject({ method: "POST", url: "/screen-effects", headers: management, payload: screenEffectDocumentSchema.parse(effect) }); expect(created.statusCode, created.body).toBe(201);
  const activated = await app.inject({ method: "PUT", url: `/screen-effects/${effectId}`, headers: management, payload: { document: { ...effect, enabled: true }, confirmLiveImpact: true } }); expect(activated.statusCode, activated.body).toBe(200);
  async function seed(moduleId: "alerts" | "screen-effects") {
    if (moduleId === "screen-effects") {
      const result = await app.inject({ method: "POST", url: `/screen-effects/${effectId}/test`, headers: management, payload: { variantId, confirmLiveImpact: true } }); expect(result.statusCode, result.body).toBe(200); expect(result.json().status).toBe("queued");
    } else {
      const id = randomUUID();
      const event = normalizedStreamEventSchema.parse({ id, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: new Date().toISOString(), type: "follow", actor: { id: "viewer", displayName: "Viewer" }, message: null, amount: null, metadata: {} });
      const alert: ResolvedAlert = { id, sourceEventId: id, ruleId: "queue-fixture", variantId: id, desktopVisualEligible: true, overlayInstruction: { id, overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: "landscape", visual: null, audio: null, text: { text: "Queue fixture", layout: { x: 0, y: 0, width: 320, height: 100, zIndex: 1 } }, tts: null, durationMs: 60000 } };
      await runtime.localMediaService.runAdmission(async () => { await runtime.localMediaService.captureAdmission([]); runtime.playbackCoordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [alert] }); });
    }
  }
  return { runtime, command, read, seed, pair, async close() { await runtime.close(); await rm(root, { recursive: true, force: true }); } };
  } catch (error) { await runtime.close(); await rm(root, { recursive: true, force: true }); throw error; }
}

it.each(["alerts", "screen-effects"] as const)("guards populated %s queues across skip, replacement and same-count pending changes", async moduleId => {
  const f = await fixture();
  try {
    await f.seed(moduleId); await f.seed(moduleId); await f.seed(moduleId);
    const owner = () => f.read().then(s => s.playback.find(p => p.moduleId === moduleId)!);
    const initial = await owner(); expect(initial.currentOccurrenceId).not.toBeNull(); expect(initial.pendingCount, JSON.stringify(f.runtime.playbackCoordinator.getSnapshot())).toBe(2);
    const pendingBefore = f.runtime.playbackOperationsService.getSnapshot().queued.filter(row => row.moduleId === moduleId).map(row => row.occurrenceId);
    const skipped = await f.command(`playback/${moduleId}/skip`, { expectedOccurrenceId: initial.currentOccurrenceId }); expect(skipped.statusCode, skipped.body).toBe(200); expect(skipped.json().changed).toBe(true);
    const next = await owner(); expect(next.currentOccurrenceId).toBe(pendingBefore[0]); expect(next.pendingCount).toBe(1);
    const stale = await f.command(`playback/${moduleId}/skip`, { expectedOccurrenceId: initial.currentOccurrenceId }); expect(stale.statusCode, stale.body).toBe(409); expect(await owner()).toEqual(next);
    const pendingId = f.runtime.playbackOperationsService.getSnapshot().queued.find(row => row.moduleId === moduleId)!.occurrenceId;
    await f.runtime.playbackOperationsService.remove(moduleId, pendingId); await f.seed(moduleId);
    const replacement = await owner(); expect(replacement.pendingCount).toBe(next.pendingCount); expect(replacement.queueRevision).not.toBe(next.queueRevision);
    const conflict = await f.command(`playback/${moduleId}/clear`, { expectedQueueRevision: next.queueRevision, expectedPendingCount: next.pendingCount }); expect(conflict.statusCode, conflict.body).toBe(409); expect(await owner()).toEqual(replacement);
    const cleared = await f.command(`playback/${moduleId}/clear`, { expectedQueueRevision: replacement.queueRevision, expectedPendingCount: replacement.pendingCount }); expect(cleared.statusCode, cleared.body).toBe(200); expect(cleared.json().changed).toBe(true);
    expect(await owner()).toMatchObject({ currentOccurrenceId: next.currentOccurrenceId, pendingCount: 0 });
    expect(f.runtime.playbackOperationsService.getSnapshot().recent.find(row => row.occurrenceId === initial.currentOccurrenceId)?.status).toBe("skipped");
  } finally { await f.close(); }
});

it("denies mixed-permission All mute atomically and applies authorized mixed/all toggles", async () => {
  const f = await fixture();
  try {
    const restricted = await f.pair(["playback:read", "playback:mute:alerts"]);
    const before = f.runtime.playbackOperationsService.getModuleMuteState();
    const denied = await f.command("playback/toggle-mute", { moduleIds: ["alerts", "screen-effects"] }, restricted); expect(denied.statusCode, denied.body).toBe(403); expect(f.runtime.playbackOperationsService.getModuleMuteState()).toEqual(before);
    const alerts = await f.command("playback/toggle-mute", { moduleIds: ["alerts"] }); expect(alerts.statusCode, alerts.body).toBe(200); expect(f.runtime.playbackOperationsService.getModuleMuteState()).toEqual({ alerts: true, "screen-effects": false });
    const all = await f.command("playback/toggle-mute", { moduleIds: ["alerts", "screen-effects"] }); expect(all.statusCode, all.body).toBe(200); expect(f.runtime.playbackOperationsService.getModuleMuteState()).toEqual({ alerts: true, "screen-effects": true });
    const unmuted = await f.command("playback/toggle-mute", { moduleIds: ["alerts", "screen-effects"] }); expect(unmuted.statusCode, unmuted.body).toBe(200); expect(f.runtime.playbackOperationsService.getModuleMuteState()).toEqual({ alerts: false, "screen-effects": false });
    expect((await f.runtime.configStore.readConfig()).playback.moduleMutes).toEqual({ alerts: false, "screen-effects": false });
  } finally { await f.close(); }
});

async function createWebBuildFixture(testRoot: string): Promise<string> {
  const webBuildDirectory = join(testRoot, "web-dist");
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.js"), "console.log('runtime smoke');", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.css"), "body { color: black; }", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "management-smoke.js"), "export {};", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "operator-smoke.js"), "export {};", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "overlay-smoke.js"), "export {};", "utf8");
  await writeFile(
    join(webBuildDirectory, ".vite", "manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/index-smoke.js",
        isEntry: true,
        css: ["assets/index-smoke.css"],
        dynamicImports: ["src/App.tsx", "src/operator/OperatorApp.tsx", "src/overlay/OverlayApp.tsx"]
      },
      "src/App.tsx": {
        file: "assets/management-smoke.js",
        src: "src/App.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      },
      "src/operator/OperatorApp.tsx": {
        file: "assets/operator-smoke.js",
        src: "src/operator/OperatorApp.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      },
      "src/overlay/OverlayApp.tsx": {
        file: "assets/overlay-smoke.js",
        src: "src/overlay/OverlayApp.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      }
    }),
    "utf8"
  );

  return webBuildDirectory;
}
