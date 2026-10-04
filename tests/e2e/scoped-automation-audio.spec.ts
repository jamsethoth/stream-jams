import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test("v1 mute reaches concurrent browser modules, future playback and reconnect without muting timer cues", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-module-audio-"));
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated port");
  await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
  const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port: address.port } };
  const runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"), configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
  const reports: unknown[] = []; page.on("websocket", socket => { socket.on("framesent", frame => { const value = JSON.parse(String(frame.payload)) as { type: string; instructionId?: string }; reports.push({ direction: "sent", type: value.type, instructionId: value.instructionId }); }); socket.on("framereceived", frame => { const value = JSON.parse(String(frame.payload)) as { type: string; instruction?: { moduleId: string; scope: string } }; reports.push({ direction: "received", type: value.type, moduleId: value.instruction?.moduleId, scope: value.instruction?.scope }); }); });
  try {
    const session = await (await request.post(`${runtime.url}/auth/management/sessions`)).json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function management(path: string, data: unknown, method = "POST") {
      const response = await request.fetch(`${runtime.url}${path}`, { method, headers, data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.status() === 204 ? null : response.json();
    }
    for (const moduleId of ["alerts", "screen-effects", "timers"]) await management(`/overlay-modules/${moduleId}/enabled`, { enabled: true }, "PATCH");
    // Genuine PCM silence allows native media progress without producing sound.
    const wav = silentWav(30);
    await mkdir(join(config.storage.assetDirectory, "audio"), { recursive: true });
    await writeFile(join(config.storage.assetDirectory, "audio/silence.wav"), wav);
    runtime.composition.database.connection.prepare("INSERT INTO asset_metadata VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("silence", "silence.wav", "audio", "audio/wav", wav.length, `sha256:${createHash("sha256").update(wav).digest("hex")}`, "audio/silence.wav", 30_000);
    const output = await management("/management/overlay-outputs/keys", { overlayId: "default", moduleId: null, purpose: "live", scope: "unified" }) as { url: string };
    await page.goto(output.url);
    await expect(page.getByTestId("overlay-root")).toBeVisible();
    const scopes = ["playback:read", "playback:mute:alerts", "playback:mute:screen-effects"];
    const verifier = "b".repeat(43);
    const pairingResponse = await request.post(`${runtime.url}/automation/v1/pairings`, { data: { clientName: "Browser mute acceptance", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url") } });
    expect(pairingResponse.status()).toBe(201);
    const pairing = await pairingResponse.json() as { id: string };
    await management(`/api/automation/pairings/${pairing.id}/approve`, { scopes });
    const exchange = await request.post(`${runtime.url}/automation/v1/pairings/${pairing.id}/exchange`, { data: { verifier } });
    expect(exchange.status()).toBe(200);
    const { token } = await exchange.json() as { token: string };
    const machine = { authorization: `Bearer ${token}` };
    const initial = await (await request.get(`${runtime.url}/automation/v1/state`, { headers: machine })).json() as { runtimeId: string };
    const toggle = async (moduleIds: string[]) => {
      const response = await request.post(`${runtime.url}/automation/v1/playback/toggle-mute`, { headers: machine, data: { observedRuntimeId: initial.runtimeId, moduleIds } });
      expect(response.status(), await response.text()).toBe(200);
    };
    const effect = await management("/screen-effects", { schemaVersion: 1, id: "audio-effect", name: "Audio effect", enabled: false, description: null, category: null, priority: 0, bindings: [], variants: [{ id: "sound", name: "Sound", enabled: true, weight: 1, visual: null, sound: { assetId: "silence", volume: 1 }, durationMs: 30_000, outputs: { browserSource: true, deviceRouteIds: [] }, visualOutputs: { browserSource: false, desktop: false } }] });
    await management("/screen-effects/audio-effect", { document: { ...effect, enabled: true }, confirmLiveImpact: true }, "PUT");
    const timer = await management("/timers", { label: "Cue", durationMs: 60_000, iconAssetId: null, startAudioAssetId: "silence", endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: [] }) as { id: string };
    let sequence = 0;
    const startAll = async () => {
      const id = `alert-${++sequence}`;
      await runtime.composition.localMediaService.runAdmission(async () => {
        await runtime.composition.localMediaService.captureAdmission(["silence"]);
        runtime.composition.playbackCoordinator.enqueueResolvedTest({ sourceEvent: { id, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: new Date().toISOString(), type: "follow", amount: null, actor: { id: "viewer", displayName: "Viewer" }, message: null, metadata: {} }, alerts: [{ id, sourceEventId: id, ruleId: "fixture", variantId: "sound", overlayInstruction: { id, overlayId: "default", moduleId: "alerts", purpose: "live", scope: "unified", visual: null, audio: { assetId: "silence", volume: 1 }, text: { text: id, layout: { x: 0, y: 0, width: 200, height: 50, zIndex: 1 } }, tts: null, durationMs: 30_000 } }] });
      });
      await management("/screen-effects/audio-effect/test", { variantId: "sound", confirmLiveImpact: true });
      await runtime.composition.timerRuntimeCoordinator.start(timer.id);
    };
    const audio = (id: string) => page.getByTestId(`overlay-module-${id}`).locator("audio");
    const assertMutes = async (alerts: boolean, effects: boolean) => {
      for (const [id, muted] of [["alerts", alerts], ["screen-effects", effects], ["timers", false]] as const) {
        await expect(audio(id)).toHaveCount(1);
        await expect.poll(() => audio(id).evaluate((element: HTMLAudioElement) => ({ muted: element.muted, progressing: element.currentTime > 0, paused: element.paused, error: element.error?.code ?? null }))).toEqual({ muted, progressing: true, paused: false, error: null });
      }
      await expect(page.getByText(`alert-${sequence}`, { exact: true })).toBeVisible();
    };
    await startAll();
    await assertMutes(false, false);
    for (const id of ["alerts", "screen-effects", "timers"]) await audio(id).evaluate((element: HTMLAudioElement) => { element.dataset.acceptanceIdentity = "original"; });
    await runtime.composition.timerRuntimeCoordinator.adjust(timer.id, { action: "set", amountMs: 45_000 });
    await expect(page.getByTestId(`timer-value-${timer.id}`)).toHaveText("0:45");
    for (const id of ["alerts", "screen-effects", "timers"]) await expect(audio(id)).toHaveAttribute("data-acceptance-identity", "original");
    await toggle(["alerts"]); await assertMutes(true, false);
    await toggle(["alerts", "screen-effects"]); await assertMutes(true, true);
    await toggle(["alerts", "screen-effects"]); await assertMutes(false, false);
    await toggle(["screen-effects"]); await assertMutes(false, true);
    // A new page establishes a new real WebSocket and receives persisted policy.
    await runtime.composition.playbackCoordinator.skipCurrent();
    const currentEffect = runtime.composition.playbackOperationsService.getSnapshot().current.find(row => row.moduleId === "screen-effects")!; await runtime.composition.effectPlaybackCoordinator.skip(currentEffect.occurrenceId);
    await runtime.composition.timerRuntimeCoordinator.stop(timer.id);
    await page.reload();
    await expect(page.getByTestId("overlay-root")).toBeVisible();
    await startAll();
    await assertMutes(false, true);
  } catch (error) { await testInfo.attach("output-state", { body: JSON.stringify({ reports, currentModules: runtime.composition.playbackOperationsService.getSnapshot().current.map(row => row.moduleId) }), contentType: "application/json" }); throw error; } finally { await page.close(); await runtime.close(); await rm(root, { recursive: true, force: true }); }
});

function silentWav(seconds: number): Buffer {
  const rate = 8000; const bytes = rate * seconds * 2; const result = Buffer.alloc(44 + bytes);
  result.write("RIFF", 0); result.writeUInt32LE(36 + bytes, 4); result.write("WAVEfmt ", 8); result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write("data", 36); result.writeUInt32LE(bytes, 40); return result;
}
