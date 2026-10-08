import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test("authors a stream event trigger that plays the effect only for matching events", async ({ page, request }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-effect-event-triggers-"));
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated port");
  await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
  const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port: address.port } };
  let runtime: StartedLocalRuntime | undefined;
  try {
    runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"), configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
    const url = runtime.url;
    const session = await (await request.post(`${url}/auth/management/sessions`)).json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function management(path: string, data?: unknown, method = "POST") {
      const response = await request.fetch(`${url}${path}`, { method, headers, ...(data === undefined ? {} : { data }) });
      expect(response.ok(), await response.text()).toBe(true);
      return response.status() === 204 ? null : response.json();
    }
    await management("/overlay-modules/screen-effects/enabled", { enabled: true }, "PATCH");
    const wav = silentWav(1);
    await mkdir(join(config.storage.assetDirectory, "audio"), { recursive: true });
    await writeFile(join(config.storage.assetDirectory, "audio/silence.wav"), wav);
    runtime.composition.database.connection.prepare("INSERT INTO asset_metadata VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("silence", "silence.wav", "audio", "audio/wav", wav.length, `sha256:${createHash("sha256").update(wav).digest("hex")}`, "audio/silence.wav", 1_000);
    await management("/screen-effects", { schemaVersion: 1, id: "raid-effect", name: "Raid effect", enabled: false, description: null, category: null, priority: 0, bindings: [], variants: [{ id: "sound", name: "Sound", enabled: true, weight: 1, visual: null, sound: { assetId: "silence", volume: 1 }, durationMs: 1_000, outputs: { browserSource: true, deviceRouteIds: [] }, visualOutputs: { browserSource: false, desktop: false } }] });

    await page.goto(`${url}/manage/modules/screen-effects/editor/raid-effect`);
    await page.getByRole("tab", { name: "Triggers" }).click();
    await page.getByLabel("Event type", { exact: true }).selectOption("raid");
    await page.getByRole("button", { name: "Add condition" }).click();
    await page.getByLabel("Event conditions Raid viewers operator").selectOption("min");
    await page.getByLabel("Event conditions Raid viewers value").fill("10");
    await page.getByRole("button", { name: "Add event trigger" }).click();
    await expect(page.getByText("Raid · Raid viewers is at least 10")).toBeVisible();
    await expect(page.getByText("Configured", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await management("/screen-effects/raid-effect", undefined, "GET") as { bindings: unknown[] }).bindings).toEqual([
      expect.objectContaining({ selector: { match: { kind: "canonical", type: "raid" }, sources: "any", conditions: [{ field: "raidViewers", operator: "min", value: 10 }] } })
    ]);
    await page.reload();
    await page.getByRole("tab", { name: "Triggers" }).click();
    await expect(page.getByText("Raid · Raid viewers is at least 10")).toBeVisible();

    const saved = await management("/screen-effects/raid-effect", undefined, "GET") as Record<string, unknown>;
    await management("/screen-effects/raid-effect", { document: { ...saved, enabled: true }, confirmLiveImpact: true }, "PUT");
    const output = await management("/management/overlay-outputs/keys", { overlayId: "default", moduleId: null, purpose: "live", scope: "unified" }) as { url: string };
    const overlay = await page.context().newPage();
    // The effect only admits events once a live browser source is registered.
    const registered = overlay.waitForEvent("websocket").then(socket => socket.waitForEvent("framereceived"));
    await overlay.goto(output.url);
    await expect(overlay.getByTestId("overlay-root")).toBeVisible();
    await registered;
    const raid = { providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: new Date().toISOString(), actor: { id: "raider", displayName: "Raider" }, message: null, metadata: {}, type: "raid", amount: 5 };
    const occurrences = () => {
      const snapshot = runtime!.composition.effectPlaybackCoordinator.getSnapshot();
      return [...(snapshot.current === null ? [] : [snapshot.current]), ...snapshot.queued, ...snapshot.recent].map(occurrence => occurrence.trigger);
    };
    await runtime.composition.eventIngestionService.ingestNormalizedEvent({ ...raid, id: "small-raid" });
    await runtime.composition.eventIngestionService.ingestNormalizedEvent({ ...raid, id: "big-raid", amount: 25 });
    await expect.poll(occurrences).toEqual([expect.objectContaining({ kind: "canonical-event", eventId: "big-raid", eventType: "raid", summary: "Raid from Raider" })]);
  } finally {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

function silentWav(seconds: number): Buffer {
  const rate = 8000; const bytes = rate * seconds * 2; const result = Buffer.alloc(44 + bytes);
  result.write("RIFF", 0); result.writeUInt32LE(36 + bytes, 4); result.write("WAVEfmt ", 8); result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write("data", 36); result.writeUInt32LE(bytes, 40); return result;
}
