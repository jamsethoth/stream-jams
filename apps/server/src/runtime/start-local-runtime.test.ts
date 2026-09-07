import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as compositionModule from "./runtime-composition.js";
import * as databaseModule from "../modules/db/database.js";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { createDefaultAppConfig } from "../config/default-config.js";
import { FileConfigStore } from "../config/file-config-store.js";
import { startLocalRuntime, LocalRuntimeStartupError } from "./start-local-runtime.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanups.splice(0).reverse()) await close(); });

async function fixture(port: number) {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-start-runtime-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const webBuildDirectory = join(root, "web");
  await mkdir(webBuildDirectory);
  await writeFile(join(webBuildDirectory, "index.html"), "<!doctype html><title>runtime fixture</title>");
  const configStore = new FileConfigStore({
    configFilePath: join(root, "config.json"),
    defaultConfig: { ...createDefaultAppConfig(root), server: { host: "127.0.0.1", port } }
  });
  return { homeDirectory: root, webBuildDirectory, configStore, secretStore: new InMemorySecretStore(), environment: {} };
}

async function listener() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  const close = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return { port: address.port, close };
}

it("serves health and closes the owned listener and database only once", async () => {
  const reservation = await listener();
  await reservation.close();
  const options = await fixture(reservation.port);
  let cancellations = 0;
  const runtime = await startLocalRuntime({ ...options, scheduleRecurring: () => 1, cancelRecurring: () => { cancellations += 1; } });
  cleanups.push(runtime.close);
  expect((await fetch(`${runtime.url}/health`)).status).toBe(200);
  await Promise.all([runtime.close(), runtime.close()]);
  expect(cancellations).toBe(1);
  await expect(fetch(`${runtime.url}/health`)).rejects.toThrow();
  expect(() => runtime.composition.database.connection.prepare("SELECT 1")).toThrow();
});

it("reports an occupied port and cleans constructed resources without closing the other listener", async () => {
  const occupied = await listener();
  cleanups.push(occupied.close);
  const options = await fixture(occupied.port);
  let cancellations = 0;
  await expect(startLocalRuntime({ ...options, scheduleRecurring: () => 1, cancelRecurring: () => { cancellations += 1; } }))
    .rejects.toBeInstanceOf(LocalRuntimeStartupError);
  expect(cancellations).toBe(1);
  // A second bind still fails: shutdown must not terminate the occupying service.
  const probe = createServer();
  await expect(new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(occupied.port, "127.0.0.1", () => { probe.close(); resolve(); });
  })).rejects.toMatchObject({ code: "EADDRINUSE" });
});

it("releases the listener and database when provider synchronization fails after listen", async () => {
  const reservation = await listener();
  await reservation.close();
  const options = await fixture(reservation.port);
  const composition = await compositionModule.createRuntimeAppComposition(options);
  cleanups.push(composition.close);
  vi.spyOn(compositionModule, "createRuntimeAppComposition").mockResolvedValue(composition);
  vi.spyOn(composition, "syncEventSourceRuntime").mockRejectedValue(new Error("provider synchronization failed"));
  await expect(startLocalRuntime(options)).rejects.toThrow("provider synchronization failed");
  await expect(fetch(`http://127.0.0.1:${reservation.port}/health`)).rejects.toThrow();
  expect(() => composition.database.connection.prepare("SELECT 1")).toThrow();
});

it("closes SQLite when composition fails after opening it but before returning a runtime", async () => {
  const options = await fixture(39187);
  const config = await options.configStore.readConfig();
  const database = databaseModule.openStreamJamsDatabase(join(config.storage.dataDirectory, "stream-jams.sqlite"));
  vi.spyOn(databaseModule, "openStreamJamsDatabase").mockReturnValue(database);
  await expect(startLocalRuntime({ ...options, scheduleRecurring() { throw new Error("Timer setup failed"); } })).rejects.toThrow("Timer setup failed");
  expect(() => database.connection.prepare("SELECT 1")).toThrow();
});
