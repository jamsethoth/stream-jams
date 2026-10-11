import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test("shows bus intake and module outcomes in Diagnostics and saves the replay age in Settings", async ({ page, request }) => {
  test.setTimeout(60_000);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-event-bus-diagnostics-"));
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
    const trigger = { kind: "streamerbot-event", occurredAt: new Date().toISOString(), providerId: "provider-streamerbot", sourceKey: "OBS", eventType: "SceneChanged", summary: "Scene", userName: "Viewer" };
    expect((await runtime.composition.eventIngestionService.ingestEffectTriggers("sb-scene", [{ ...trigger, eventId: "sb-scene" }])).status).toBe("accepted");
    expect((await runtime.composition.eventIngestionService.ingestEffectTriggers("sb-scene", [{ ...trigger, eventId: "sb-scene" }])).status).toBe("duplicate");

    await page.goto(`${url}/manage/diagnostics`);
    await page.getByRole("tab", { name: /Event intake/u }).click();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Duplicate");
    await expect(rows.nth(2)).toContainText("Accepted");
    await rows.nth(2).getByRole("button", { name: "OBS · SceneChanged" }).click();
    const outcomes = page.getByLabel("Bus event detail").getByRole("list", { name: "Module outcomes" });
    await expect(outcomes.getByRole("listitem")).toHaveCount(4);
    await expect(outcomes).toContainText("Alerts");
    await expect(outcomes).toContainText("No match");
    await expect(page.getByLabel("Bus event detail")).not.toContainText("Viewer");

    await page.goto(`${url}/manage/settings`);
    await page.getByText("Event replay").click();
    const replayAge = page.getByRole("combobox", { name: "Replay age" });
    await expect(replayAge).toHaveValue("120");
    await replayAge.selectOption("300");
    await page.getByRole("button", { name: "Save replay age" }).click();
    await expect(page.getByText("Event replay age saved.")).toBeVisible();
    const session = await (await request.post(`${url}/auth/management/sessions`)).json() as { id: string };
    const saved = await request.get(`${url}/management/settings/event-bus`, { headers: { authorization: `Bearer ${session.id}` } });
    expect(await saved.json()).toEqual({ replayAgeSeconds: 300 });
  } finally {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});
