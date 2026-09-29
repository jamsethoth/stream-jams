import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test.describe.serial("generic Timer HTTP automation", () => {
  let root: string;
  let runtime: StartedLocalRuntime;

  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "stream-jams-timer-automation-"));
    const port = await unusedPort();
    const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port } };
    runtime = await startLocalRuntime({
      homeDirectory: root,
      webBuildDirectory: resolve("apps/web/dist"),
      configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }),
      environment: {},
      secretStore: new InMemorySecretStore()
    });
  });

  test.afterAll(async () => {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  });

  test("rotates, invokes every allowlisted route, rejects unsafe calls, and revokes without logging tokens", async () => {
    const sessionResponse = await fetch(`${runtime.url}/auth/management/sessions`, { method: "POST" });
    expect(sessionResponse.ok).toBe(true);
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const managementHeaders = {
      authorization: `Bearer ${session.id}`,
      "x-stream-jams-csrf": session.csrfToken
    };
    const management = (path: string, method: string, body?: unknown) => fetch(`${runtime.url}${path}`, {
      method,
      headers: { ...managementHeaders, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const created = await management("/timers", "POST", {
      label: "Automation acceptance",
      durationMs: 60_000,
      iconAssetId: null,
      startAudioAssetId: null,
      endAudioAssetId: null,
      outputs: { browserSource: false, deviceRouteIds: [] }
    });
    expect(created.status).toBe(201);
    const timer = await created.json() as { id: string };

    const issuedResponse = await management("/timers/automation-credential/rotate", "POST");
    expect(issuedResponse.status).toBe(201);
    const first = await issuedResponse.json() as { token: string };
    const automation = (token: string, path: string, method = "POST", body?: unknown, origin?: string) => fetch(`${runtime.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(origin === undefined ? {} : { origin })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const inventory = await automation(first.token, "/automation/timers", "GET");
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).toEqual([expect.objectContaining({ id: timer.id, label: "Automation acceptance", state: null })]);
    const firstStart = await automation(first.token, `/automation/timers/${timer.id}/start`);
    expect(await firstStart.json()).toMatchObject({ changed: true, state: { status: "running" } });
    const retryStart = await automation(first.token, `/automation/timers/${timer.id}/start`);
    expect(await retryStart.json()).toMatchObject({ changed: false, state: { status: "running" } });
    for (const [command, status] of [["pause", "paused"], ["resume", "running"], ["restart", "running"]] as const) {
      const response = await automation(first.token, `/automation/timers/${timer.id}/${command}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ changed: true, state: { status } });
    }
    const stopped = await automation(first.token, `/automation/timers/${timer.id}/stop`);
    expect(await stopped.json()).toEqual({ changed: true, state: null });

    expect((await automation("tmr_invalid_invalid_invalid_invalid", "/automation/timers", "GET")).status).toBe(401);
    expect((await automation(first.token, `/automation/timers/${timer.id}/start`, "POST", { durationMs: 1 })).status).toBe(400);
    expect((await automation(first.token, "/automation/timers", "GET", undefined, "http://127.0.0.1:9999")).status).toBe(403);

    const rotatedResponse = await management("/timers/automation-credential/rotate", "POST");
    const rotated = await rotatedResponse.json() as { token: string };
    expect((await automation(first.token, "/automation/timers", "GET")).status).toBe(401);
    expect((await automation(rotated.token, "/automation/timers", "GET")).status).toBe(200);
    expect((await management("/timers/automation-credential", "DELETE")).status).toBe(204);
    expect((await automation(rotated.token, "/automation/timers", "GET")).status).toBe(401);
  });
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated TCP port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
