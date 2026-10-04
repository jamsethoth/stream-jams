import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { WebSocket } from "ws";
import { createDefaultAppConfig } from "../config/default-config.js";
import { FileConfigStore } from "../config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../runtime/start-local-runtime.js";

export function createProviderSocket(url: string) { return new WebSocket(url); }

export async function createProviderSecurityRuntimeFixture() {
  const homeDirectory = await mkdtemp(join(tmpdir(), "stream-jams-provider-security-"));
  const reservation = createServer();
  await new Promise<void>(resolveListening => reservation.listen(0, "127.0.0.1", resolveListening));
  const address = reservation.address();
  if (address === null || typeof address === "string") throw new Error("Runtime fixture did not reserve TCP");
  await new Promise<void>(resolveClose => reservation.close(() => resolveClose()));
  const secretStore = new InMemorySecretStore();
  const configStore = new FileConfigStore({ configFilePath: join(homeDirectory, "config.json"), defaultConfig: {
    ...createDefaultAppConfig(homeDirectory), server: { host: "127.0.0.1", port: address.port }
  } });
  let runtime: StartedLocalRuntime | null = null;
  let headers: Record<string, string> = {};
  const start = async () => {
    // Portable restore includes source server preferences; keep this fixture's isolated listener.
    await configStore.updateConfig({ server: { host: "127.0.0.1", port: address.port } });
    runtime = await startLocalRuntime({ homeDirectory, configStore, secretStore, environment: {}, webBuildDirectory: resolve("apps/web/dist"), scheduleRecurring: () => 1, cancelRecurring: () => {} });
    const sessionResponse = await fetch(`${runtime.url}/auth/management/sessions`, { method: "POST" });
    if (sessionResponse.status !== 201) throw new Error(`Session bootstrap failed: ${sessionResponse.status}`);
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: runtime.url };
    return runtime;
  };
  return {
    homeDirectory, secretStore,
    get runtime() { if (runtime === null) throw new Error("Runtime fixture is stopped"); return runtime; },
    get headers() { return headers; },
    start,
    async request(path: string, method = "GET", body?: unknown) {
      if (runtime === null) throw new Error("Runtime fixture is stopped");
      return fetch(`${runtime.url}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    },
    async stop() { await runtime?.close(); runtime = null; },
    async readLogs() {
      const directory = join(homeDirectory, ".stream-jams", "data", "logs");
      const entries = await readdir(directory, { recursive: true, withFileTypes: true });
      return (await Promise.all(entries.filter(entry => entry.isFile()).map(entry => readFile(join(entry.parentPath, entry.name), "utf8")))).join("\n");
    },
    async close() { await runtime?.close(); runtime = null; await rm(homeDirectory, { recursive: true, force: true }); }
  };
}
