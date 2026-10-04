import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InMemorySecretStore, startPearProtocolFixture, type PearProtocolFixture } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No disposable port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

/** Built service and protocol peer with no access to the user's profile or keyring. */
export async function startMusicTestRuntime() {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-music-acceptance-"));
  const pear = await startPearProtocolFixture();
  const port = await unusedPort();
  const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port } };
  const options = {
    homeDirectory: root,
    webBuildDirectory: resolve("apps/web/dist"),
    configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }),
    environment: {}, secretStore: new InMemorySecretStore()
  };
  let runtime: StartedLocalRuntime | null = null;
  try { runtime = await startLocalRuntime(options); }
  catch (error) { await pear.close(); await rm(root, { recursive: true, force: true }); throw error; }
  const current = () => {
    if (runtime === null) throw new Error("Music runtime is closed");
    return runtime;
  };
  const base = current().url;
  async function sessionHeaders() {
    const response = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    if (!response.ok) throw new Error(`Management session: ${response.status}`);
    const session = await response.json() as { id: string; csrfToken: string };
    return { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  }
  const headers = await sessionHeaders();
  async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const result = await fetch(`${base}${path}`, {
      method, headers: { ...headers, ...(data === undefined ? {} : { "content-type": "application/json" }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(10_000)
    });
    if (!result.ok) throw new Error(`${method} ${path}: ${result.status} ${await result.text()}`);
    return result.status === 204 ? undefined as T : result.json() as Promise<T>;
  }
  async function pair(transport: "auto" | "ws" | "poll" = "poll") {
    const configuration = { baseUrl: pear.baseUrl, transport };
    const attempt = await request<{ attemptId: string }>("/management/music/pairing", "POST", configuration);
    let status: { status: string } = { status: "pending" };
    for (let i = 0; i < 40 && status.status === "pending"; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      status = await request(`/management/music/pairing/${attempt.attemptId}`);
    }
    if (status.status !== "approved") throw new Error(`Pear fixture approval: ${status.status}`);
    return { configuration, pairingAttemptId: attempt.attemptId };
  }
  async function register(name = "Fixture Pear", transport: "auto" | "ws" | "poll" = "poll") {
    const claim = await pair(transport);
    const setup = { kind: "pear-desktop", name, ...claim };
    const validation = await request<{ valid: boolean }>("/management/providers/validate", "POST", setup);
    if (!validation.valid) throw new Error("Fixture validation failed");
    const saved = await request<{ status: string; provider: { provider: { id: string } } }>("/management/providers", "POST", setup);
    if (saved.status !== "registered") throw new Error("Fixture source was not registered");
    return saved.provider.provider.id;
  }
  return {
    root, pear: pear as PearProtocolFixture, url: base, headers, request, pair, register,
    get runtime() { return current(); },
    async restart() { await current().close(); runtime = await startLocalRuntime(options); Object.assign(headers, await sessionHeaders()); },
    async close() { try { await runtime?.close(); } finally { runtime = null; await pear.close(); await rm(root, { recursive: true, force: true }); } }
  };
}
