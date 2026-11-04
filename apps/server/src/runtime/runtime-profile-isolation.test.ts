import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { OsCredentialAdapter } from "../modules/security/os-secret-store.js";
import { createRuntimeAppComposition } from "./runtime-composition.js";

let root: string;
let userHome: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "stream-jams-profile-runtime-"));
  userHome = join(root, "user");
  await mkdir(join(userHome, ".stream-jams", "data"), { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

class RecordingCredentials implements OsCredentialAdapter {
  readonly services = new Set<string>();
  readonly #values = new Map<string, string>();
  async setPassword(service: string, account: string, password: string) { this.services.add(service); this.#values.set(`${service}|${account}`, password); }
  async getPassword(service: string, account: string) { this.services.add(service); return this.#values.get(`${service}|${account}`) ?? null; }
  async deletePassword(service: string, account: string) { this.services.add(service); return this.#values.delete(`${service}|${account}`); }
}

async function webBuild(): Promise<string> {
  const directory = join(root, "web-dist");
  await mkdir(join(directory, ".vite"), { recursive: true });
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(join(directory, "assets", "index.js"), "export {};");
  await writeFile(join(directory, ".vite", "manifest.json"), JSON.stringify({ "index.html": { file: "assets/index.js", isEntry: true } }));
  return directory;
}

it("starts a dev runtime under its own home, port, marker and credential prefix", async () => {
  const devHome = join(root, "dev");
  const credentials = new RecordingCredentials();
  const composition = await createRuntimeAppComposition({ homeDirectory: userHome, webBuildDirectory: await webBuild(),
    environment: { STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: devHome }, credentialAdapter: credentials });
  try {
    const config = await composition.configStore.readConfig();
    expect(config.server.port).toBe(39287);
    expect(config.storage.dataDirectory).toBe(join(devHome, "data"));
    expect(config.playback.muted).toBe(true);
    expect(JSON.parse(await readFile(join(devHome, "data", "profile.json"), "utf8"))).toMatchObject({ profile: "dev" });
    expect([...credentials.services].length).toBeGreaterThan(0);
    expect([...credentials.services].every(service => service.startsWith("stream-jams-dev:"))).toBe(true);
    expect(existsSync(join(userHome, ".stream-jams", "data", "stream-jams.sqlite"))).toBe(false);
  } finally { await composition.close(); }
});

it("refuses a dev config pointed at production data before opening SQLite or credentials", async () => {
  const devHome = join(root, "dev");
  await mkdir(devHome, { recursive: true });
  await writeFile(join(devHome, "config.json"), JSON.stringify({ server: { host: "127.0.0.1", port: 39287 },
    storage: { dataDirectory: join(userHome, ".stream-jams", "data"), assetDirectory: join(devHome, "assets") } }));
  const credentials = new RecordingCredentials();
  await expect(createRuntimeAppComposition({ homeDirectory: userHome, webBuildDirectory: await webBuild(),
    environment: { STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: devHome }, credentialAdapter: credentials })).rejects.toThrow(/production Stream Jams folder/u);
  expect(existsSync(join(userHome, ".stream-jams", "data", "stream-jams.sqlite"))).toBe(false);
  expect(existsSync(join(userHome, ".stream-jams", "data", "profile.json"))).toBe(false);
  expect(credentials.services.size).toBe(0);
});

it("refuses a dev config file inside the production folder without creating it", async () => {
  const configPath = join(userHome, ".stream-jams", "dev-config.json");
  await expect(createRuntimeAppComposition({ homeDirectory: userHome, webBuildDirectory: await webBuild(),
    environment: { STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: join(root, "dev"), STREAM_JAMS_CONFIG_PATH: configPath } })).rejects.toThrow(/config file/u);
  expect(existsSync(configPath)).toBe(false);
});

it("keeps production on its default prefix and marks its data directory", async () => {
  const credentials = new RecordingCredentials();
  const composition = await createRuntimeAppComposition({ homeDirectory: userHome, webBuildDirectory: await webBuild(), environment: {}, credentialAdapter: credentials });
  try {
    expect([...credentials.services].every(service => service.startsWith("stream-jams:"))).toBe(true);
    expect(JSON.parse(await readFile(join(userHome, ".stream-jams", "data", "profile.json"), "utf8"))).toMatchObject({ profile: "production" });
  } finally { await composition.close(); }
});
