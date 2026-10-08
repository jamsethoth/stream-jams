import { expect, test } from "@playwright/test";
import { dataOverlayStateSchema } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDefaultAppConfig } from "../../apps/server/src/config/default-config.js";
import { FileConfigStore } from "../../apps/server/src/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/src/runtime/start-local-runtime.js";
import { SqliteTwitchAccountRepository } from "../../apps/server/src/modules/twitch/sqlite-twitch-account-repository.js";
import { createTwitchTokenSecretRef, defaultTwitchClientId, defaultTwitchOAuthScopes } from "../../apps/server/src/modules/twitch/twitch-oauth-service.js";
import type { TwitchApiClient } from "../../apps/server/src/modules/twitch/twitch-api-client.js";

// All provider responses below are synthetic fixtures; no real OAuth or account is used.
test.use({ trace: "off", screenshot: "off", video: "off" });
async function createFixture() {
  const homeDirectory = await mkdtemp(join(tmpdir(), "stream-jams-twitch-browser-"));
  const reservation = createServer();
  await new Promise<void>(done => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (address === null || typeof address === "string") throw new Error("Synthetic runtime could not reserve a port");
  await new Promise<void>(done => reservation.close(() => done()));
  const configStore = new FileConfigStore({ configFilePath: join(homeDirectory, "config.json"), defaultConfig: { ...createDefaultAppConfig(homeDirectory), server: { host: "127.0.0.1", port: address.port } } });
  const secretStore = new InMemorySecretStore();
  let runtime: StartedLocalRuntime | null = null;
  let headers: Record<string, string> = {};
  let total = 990;
  let requests = 0;
  let scopes: readonly string[] = defaultTwitchOAuthScopes;
  const unexpectedOAuth = async (): Promise<never> => { throw new Error("Real OAuth must never run in this synthetic fixture"); };
  const twitchApiClient: TwitchApiClient = {
    startDeviceAuthorization: unexpectedOAuth, pollDeviceAuthorization: unexpectedOAuth,
    refreshUserToken: unexpectedOAuth, getCurrentUser: unexpectedOAuth,
    validateToken: async () => ({ clientId: defaultTwitchClientId, login: "synthetic", scopes, userId: "synthetic-broadcaster", expiresIn: 3600 })
  };
  const start = async () => {
    runtime = await startLocalRuntime({ homeDirectory, configStore, secretStore, environment: {}, webBuildDirectory: resolve("apps/web/dist"), scheduleRecurring: () => 1, cancelRecurring: () => {}, twitchApiClient,
      twitchEventSubSocketFactory: () => { throw new Error("Provider sockets must never open in this synthetic fixture"); },
      twitchDataApiClient: { getFollowerTotal: async () => { requests++; return { total, rateResetEpochMs: null }; }, getCreatorGoals: async () => { throw new Error("Blocked Creator Goals must never fetch in production"); } }
    });
    const response = await fetch(`${runtime.url}/auth/management/sessions`, { method: "POST" });
    if (response.status !== 201) throw new Error(`Synthetic session failed: ${response.status}`);
    const session = await response.json() as { id: string; csrfToken: string };
    headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: runtime.url };
  };
  return {
    start, get runtime() { if (runtime === null) throw new Error("Runtime stopped"); return runtime; },
    get requests() { return requests; }, set total(value: number) { total = value; },
    async connect(includeGoalScope = false) {
      if (runtime === null) throw new Error("Runtime stopped");
      scopes = includeGoalScope ? [...defaultTwitchOAuthScopes, "channel:read:goals"] : defaultTwitchOAuthScopes;
      const account = { accountId: "synthetic-broadcaster", login: "synthetic", displayName: "Synthetic", scopes, connectedAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z" };
      await new SqliteTwitchAccountRepository(runtime.composition.database.connection).saveAccount(account);
      await secretStore.setSecret(createTwitchTokenSecretRef(account.accountId, "access_token"), "synthetic-access-token");
      // Restart the isolated service to exercise the production account lifecycle.
      await runtime.close(); runtime = null; await start();
    },
    async request(path: string, method = "GET", body?: unknown) {
      if (runtime === null) throw new Error("Runtime stopped");
      return fetch(`${runtime.url}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    },
    async stop() { await runtime?.close(); runtime = null; },
    async close() { await runtime?.close(); runtime = null; await rm(homeDirectory, { recursive: true, force: true }); }
  };
}

test("production Twitch source creation uses authoritative totals and read-only controls without enabling blocked Creator Goals", async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await createFixture();
  try {
    await fixture.start(); expect((await fixture.request("/health")).status).toBe(200);
    await page.goto(`${fixture.runtime.url}/manage/data`);
    const sources = page.getByRole("region", { name: "Twitch data sources", exact: true });
    await expect(sources.getByRole("link", { name: "Connect Twitch in Event sources" })).toBeVisible();
    await sources.getByRole("textbox", { name: "Follower value name" }).fill("Disconnected draft");
    await expect(sources.getByRole("button", { name: "Create follower value" })).toBeDisabled();
    expect(fixture.requests).toBe(0);
    await fixture.connect(); expect(fixture.requests).toBe(0); await page.reload();
    await expect(sources.getByText(/Follower total:/u)).toContainText("Not configured");
    await expect(sources.getByText(/Creator Goals:/u)).toContainText("channel:read:goals");
    await expect(sources.getByText(/Creator Goals:/u)).toContainText("Existing alert intake remains available");
    await expect(sources.getByRole("link", { name: "Review or reconnect Twitch" })).toHaveAttribute("href", "/manage/event-sources");
    await expect(sources.getByRole("combobox")).toHaveCount(0);
    await sources.getByRole("textbox", { name: "Follower value name" }).fill("Synthetic followers");
    await sources.getByRole("button", { name: "Create follower value" }).click();
    const values = page.getByRole("region", { name: "Values", exact: true });
    await expect(values.getByRole("cell", { name: "990", exact: true })).toBeVisible();
    expect(fixture.requests).toBe(1);
    const state = dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json());
    const follower = state.values.find(value => value.name === "Synthetic followers")!;
    expect(follower).toMatchObject({ kind: "integer", content: 990, source: { provider: "twitch", kind: "follower-total", broadcasterId: "synthetic-broadcaster" } });
    await values.getByRole("checkbox", { name: "Pin Synthetic followers" }).check();
    await values.getByRole("button", { name: "Edit Synthetic followers", exact: true }).click();
    const editor = page.getByRole("form", { name: "Data definition editor" });
    await expect(editor.getByText(/Twitch follower total is read-only/u)).toBeVisible();
    await expect(editor.getByLabel("Reset default", { exact: true })).toHaveCount(0);
    await expect(editor.getByRole("combobox", { name: "Reset group" })).toHaveCount(0);
    await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Renamed followers");
    await editor.getByRole("button", { name: "Save definition" }).click();
    await expect(values.getByRole("button", { name: "Edit Renamed followers", exact: true })).toBeVisible();
    await page.goto(`${fixture.runtime.url}/operator`);
    const data = page.getByRole("region", { name: "Data", exact: true });
    await expect(data.getByText("Current: 990", { exact: true })).toBeVisible();
    await expect(data.getByText(/Twitch follower total · Read-only/u)).toBeVisible();
    for (const command of ["Set Renamed followers", "Reset Renamed followers", "Add one to Renamed followers", "Subtract one from Renamed followers"]) await expect(data.getByRole("button", { name: command, exact: true })).toHaveCount(0);
    const rejected = await fixture.request(`/operator/data-overlays/values/${follower.id}/reset`, "POST", {});
    expect(rejected.status).toBe(409); expect(await rejected.json()).toMatchObject({ error: { code: "DATA_SOURCE_READ_ONLY" } });
    // Synthetic reconnection grants the optional scope but never unlocks absent goal production.
    await fixture.connect(true);
    await page.goto(`${fixture.runtime.url}/manage/data`);
    await expect(sources.getByText(/Creator Goals:/u)).toContainText("central event bus");
    await expect(sources.getByRole("combobox")).toHaveCount(0);
    // Restart takes a fresh authoritative snapshot; totals can decrease.
    fixture.total = 980; await fixture.stop(); await fixture.start();
    await page.goto(`${fixture.runtime.url}/manage/data`);
    await expect(values.getByRole("cell", { name: "980", exact: true })).toBeVisible();
    const restored = dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json());
    expect(restored.values.find(value => value.id === follower.id)).toMatchObject({ name: "Renamed followers", content: 980, source: follower.source });
    await page.goto(`${fixture.runtime.url}/operator`); await expect(data.getByText("Current: 980", { exact: true })).toBeVisible();
  } finally { await fixture.close(); }
});
