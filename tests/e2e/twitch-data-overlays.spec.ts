import { expect, test } from "@playwright/test";
import { dataOverlayStateSchema, twitchDataSourceStatusSchema, type OverlayOutputKeyResult } from "@stream-jams/core";
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
import type { TwitchApiClient, TwitchCreatorGoal } from "../../apps/server/src/modules/twitch/twitch-api-client.js";
import type { TwitchEventSubSocket } from "../../apps/server/src/modules/twitch/twitch-eventsub-client.js";

// All provider responses below are synthetic fixtures; no real OAuth or account is used.
test.use({ trace: "off", screenshot: "off", video: "off" });
class SyntheticEventSubSocket implements TwitchEventSubSocket {
  readonly messages: ((event: { data: unknown }) => void | Promise<void>)[] = [];
  addEventListener(event: "open", listener: () => void): void;
  addEventListener(event: "message", listener: (event: { data: unknown }) => void | Promise<void>): void;
  addEventListener(event: "close", listener: (event: { code?: number; reason?: string }) => void): void;
  addEventListener(event: "error", listener: (event: unknown) => void): void;
  addEventListener(event: string, listener: unknown): void {
    if (event === "message") this.messages.push(listener as (event: { data: unknown }) => void | Promise<void>);
  }
  close(): void {}
  async emit(message: unknown): Promise<void> {
    for (const listener of this.messages) await listener({ data: JSON.stringify(message) });
  }
}
function syntheticGoal(id = "goal-first", amount = 40): TwitchCreatorGoal {
  return { id, broadcaster_id: "synthetic-broadcaster", broadcaster_login: "synthetic", broadcaster_name: "Synthetic", type: "follower", description: id, current_amount: amount, target_amount: 100, started_at: "2026-10-11T00:00:00Z" };
}
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
  let accountId = "synthetic-broadcaster";
  let goals: TwitchCreatorGoal[] = [syntheticGoal()];
  const sockets: SyntheticEventSubSocket[] = [];
  const unexpectedOAuth = async (): Promise<never> => { throw new Error("Real OAuth must never run in this synthetic fixture"); };
  const twitchApiClient: TwitchApiClient = {
    startDeviceAuthorization: unexpectedOAuth, pollDeviceAuthorization: unexpectedOAuth,
    refreshUserToken: unexpectedOAuth, getCurrentUser: unexpectedOAuth,
    validateToken: async () => ({ clientId: defaultTwitchClientId, login: "synthetic", scopes, userId: accountId, expiresIn: 3600 })
  };
  const start = async () => {
    runtime = await startLocalRuntime({ homeDirectory, configStore, secretStore, environment: {}, webBuildDirectory: resolve("apps/web/dist"), scheduleRecurring: () => 1, cancelRecurring: () => {}, twitchApiClient,
      twitchEventSubSocketFactory: () => { const socket = new SyntheticEventSubSocket(); sockets.push(socket); return socket; },
      twitchEventSubApiClient: { createSubscription: async ({ subscription }) => ({ id: `synthetic-${subscription.type}`, status: "enabled", type: subscription.type }) },
      twitchDataApiClient: { getFollowerTotal: async () => { requests++; return { total, rateResetEpochMs: null }; }, getCreatorGoals: async () => {
        if (!scopes.includes("channel:read:goals")) throw new Error("Missing optional permission must never fetch goals");
        return { goals: structuredClone(goals), rateResetEpochMs: null };
      } }
    });
    const response = await fetch(`${runtime.url}/auth/management/sessions`, { method: "POST" });
    if (response.status !== 201) throw new Error(`Synthetic session failed: ${response.status}`);
    const session = await response.json() as { id: string; csrfToken: string };
    headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: runtime.url };
    const socket = sockets.at(-1);
    if (socket) await socket.emit({ metadata: { message_type: "session_welcome", message_timestamp: new Date().toISOString() }, payload: { session: { id: `synthetic-session-${sockets.length}`, status: "connected", keepalive_timeout_seconds: 600, reconnect_url: null, connected_at: new Date().toISOString() } } });
  };
  return {
    start, get runtime() { if (runtime === null) throw new Error("Runtime stopped"); return runtime; },
    get requests() { return requests; }, set total(value: number) { total = value; },
    set goals(value: TwitchCreatorGoal[]) { goals = value; },
    async notifyGoal(phase: "begin" | "progress" | "end", goal: TwitchCreatorGoal) {
      const timestamp = new Date().toISOString();
      await sockets.at(-1)!.emit({ metadata: { message_id: crypto.randomUUID(), message_type: "notification", message_timestamp: timestamp, subscription_type: `channel.goal.${phase}`, subscription_version: "1" }, payload: {
        subscription: { id: `synthetic-channel.goal.${phase}`, status: "enabled", type: `channel.goal.${phase}`, version: "1", condition: { broadcaster_user_id: accountId } },
        event: { id: goal.id, broadcaster_user_id: goal.broadcaster_id, broadcaster_user_name: goal.broadcaster_name, type: goal.type, description: goal.description, current_amount: goal.current_amount, target_amount: goal.target_amount, started_at: goal.started_at, ...(phase === "end" ? { ended_at: timestamp, is_achieved: false } : {}) }
      } });
    },
    async notifyFollow() {
      const timestamp = new Date().toISOString();
      await sockets.at(-1)!.emit({ metadata: { message_id: crypto.randomUUID(), message_type: "notification", message_timestamp: timestamp, subscription_type: "channel.follow", subscription_version: "2" }, payload: {
        subscription: { id: "synthetic-follow", status: "enabled", type: "channel.follow", version: "2", condition: { broadcaster_user_id: accountId, moderator_user_id: accountId } },
        event: { user_id: "synthetic-viewer", user_login: "viewer", user_name: "Viewer", broadcaster_user_id: accountId, broadcaster_user_login: "synthetic", broadcaster_user_name: "Synthetic", followed_at: timestamp }
      } });
    },
    async connect(includeGoalScope = false, broadcasterId = "synthetic-broadcaster") {
      if (runtime === null) throw new Error("Runtime stopped");
      scopes = includeGoalScope ? [...defaultTwitchOAuthScopes, "channel:read:goals"] : defaultTwitchOAuthScopes;
      accountId = broadcasterId;
      const account = { accountId, login: "synthetic", displayName: "Synthetic", scopes, connectedAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z" };
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

test("production Twitch source creation uses authoritative totals and read-only controls without optional goal permission", async ({ page }) => {
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
    expect((await fixture.request("/management/providers", "POST", { name: "Synthetic Twitch", kind: "twitch", configuration: {} })).status).toBe(201);
    await fixture.stop(); await fixture.start(); await page.reload();
    expect(fixture.runtime.composition.twitchEventSubRuntimeService.getStatus().subscriptionTypes).toContain("channel.follow");
    await fixture.notifyFollow();
    await expect.poll(() => fixture.runtime.composition.twitchEventSubRuntimeService.getStatus().acceptedCount).toBe(1);
    await expect(sources.getByText(/Follower total:/u)).toContainText("Not configured");
    await expect(sources.getByText(/Creator Goals:/u)).toContainText("channel:read:goals");
    await expect(sources.getByText(/Creator Goals:/u)).toContainText("Existing alert intake remains available");
    await expect(sources.getByRole("link", { name: "Review or reconnect Twitch" })).toHaveAttribute("href", "/manage/event-sources");
    await expect(sources.getByRole("button", { name: "Create Creator Goal" })).toBeDisabled();
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
    // Restart takes a fresh authoritative snapshot; totals can decrease.
    fixture.total = 980; await fixture.stop(); await fixture.start();
    await page.goto(`${fixture.runtime.url}/manage/data`);
    await expect(values.getByRole("cell", { name: "980", exact: true })).toBeVisible();
    const restored = dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json());
    expect(restored.values.find(value => value.id === follower.id)).toMatchObject({ name: "Renamed followers", content: 980, source: follower.source });
    await page.goto(`${fixture.runtime.url}/operator`); await expect(data.getByText("Current: 980", { exact: true })).toBeVisible();
  } finally { await fixture.close(); }
});

test("Creator Goals flow from EventSub to read-only controls and live text/progress, with end, rebind and account safety", async ({ page, context }) => {
  test.setTimeout(120000);
  const fixture = await createFixture();
  const status = async () => twitchDataSourceStatusSchema.parse(await (await fixture.request("/data-overlays/sources/twitch")).json());
  const state = async () => dataOverlayStateSchema.parse(await (await fixture.request("/data-overlays")).json());
  try {
    await fixture.start(); await fixture.connect(true);
    expect((await fixture.request("/management/providers", "POST", { name: "Synthetic Twitch", kind: "twitch", configuration: {} })).status).toBe(201);
    await fixture.stop(); await fixture.start();
    await expect.poll(async () => (await status()).goals.state).toBe("current");
    await page.goto(`${fixture.runtime.url}/manage/data`);
    const sources = page.getByRole("region", { name: "Twitch data sources", exact: true });
    await sources.getByRole("textbox", { name: "Creator Goal name" }).fill("Live followers");
    await sources.getByRole("button", { name: "Create Creator Goal", exact: true }).click();
    const values = page.getByRole("region", { name: "Values", exact: true });
    await expect(values.getByRole("cell", { name: "40", exact: true })).toBeVisible();
    await expect(values.getByText("integer · Twitch Creator Goal (read-only)")).toBeVisible();
    await values.getByRole("checkbox", { name: "Pin Live followers", exact: true }).check();
    await expect(values.getByRole("checkbox", { name: "Pin Live followers", exact: true })).toBeChecked();
    const latest = (await state()).goals.find(goal => goal.name === "Live followers")!;
    await sources.getByRole("textbox", { name: "Creator Goal name" }).fill("Pinned followers");
    await sources.getByRole("combobox", { name: "Goal binding" }).selectOption("pinned");
    await sources.getByRole("combobox", { name: "Pinned Twitch goal" }).selectOption("goal-first");
    await sources.getByRole("button", { name: "Create Creator Goal", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit Pinned followers", exact: true })).toHaveCount(2);
    const pinned = (await state()).goals.find(goal => goal.name === "Pinned followers")!;
    await page.getByRole("region", { name: "Goals", exact: true }).getByRole("button", { name: "Edit Live followers", exact: true }).click();
    const editor = page.getByRole("form", { name: "Data definition editor" });
    await expect(editor.getByText(/Twitch Creator Goal is read-only/u)).toBeVisible();
    await expect(editor.getByLabel("Target", { exact: true })).toHaveCount(0);
    await editor.getByRole("button", { name: "Discard definition" }).click();
    expect((await fixture.request(`/operator/data-overlays/values/${latest.valueId}/reset`, "POST", {})).status).toBe(409);
    const geometry = { order: 0, x: 40, y: 40, width: 300, height: 80, visible: true, stalePolicy: "retain-last" };
    expect((await fixture.request("/data-overlays/canvases", "POST", { name: "Live goal display", enabled: true, order: 0, targetProfileId: "landscape", outputs: { browser: true, desktop: true }, elements: [
      { ...geometry, id: "latest-text", kind: "text", binding: { kind: "value", valueId: latest.valueId }, literalText: "", format: { thousandsSeparator: true, prefix: "Live ", suffix: "", overflow: "wrap" }, style: { fontSizePx: 40, color: "#ffffffff", fontWeight: 400, align: "left" } },
      { ...geometry, id: "latest-bar", kind: "progress", y: 140, goalId: latest.id, orientation: "horizontal", direction: "forward", fillColor: "#00ff00ff", backgroundColor: "#000000ff", borderColor: "#ffffffff", borderWidthPx: 1 },
      { ...geometry, id: "pinned-text", kind: "text", y: 240, binding: { kind: "value", valueId: pinned.valueId }, literalText: "", format: { thousandsSeparator: true, prefix: "Pinned ", suffix: "", overflow: "wrap" }, style: { fontSizePx: 40, color: "#ffffffff", fontWeight: 400, align: "left" } }
    ] })).status).toBe(201);
    expect((await fixture.request("/overlay-modules/data-overlays/enabled", "PATCH", { enabled: true })).status).toBe(200);
    const key = await (await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "module", moduleId: "data-overlays", purpose: "live", targetProfileId: "landscape" })).json() as OverlayOutputKeyResult;
    const output = await context.newPage(); await output.goto(new URL(key.url, fixture.runtime.url).toString());
    await expect(output.getByText("Live 40", { exact: true })).toBeVisible();
    await expect(output.locator('[data-element-id="latest-bar"] > div')).toHaveAttribute("style", /width: 40%;/u);
    await fixture.notifyGoal("progress", syntheticGoal("goal-first", 65));
    await expect(output.getByText("Live 65", { exact: true })).toBeVisible();
    await expect(output.locator('[data-element-id="latest-bar"] > div')).toHaveAttribute("style", /width: 65%;/u);
    await expect(output.getByText("Pinned 65", { exact: true })).toBeVisible();
    await page.goto(`${fixture.runtime.url}/operator`);
    const data = page.getByRole("region", { name: "Data", exact: true });
    await expect(data.getByText("Current: 65", { exact: true })).toBeVisible();
    await expect(data.getByText(/Twitch Creator Goal · Read-only/u)).toBeVisible();
    await expect(data.getByRole("button", { name: "Set Live followers", exact: true })).toHaveCount(0);
    await fixture.notifyGoal("end", syntheticGoal("goal-first", 65));
    await expect(output.locator("[data-element-id]")).toHaveCount(0);
    const replacement = { ...syntheticGoal("goal-replacement", 5), target_amount: 200, started_at: new Date().toISOString() };
    fixture.goals = [replacement]; await fixture.notifyGoal("begin", replacement);
    await expect(output.getByText("Live 5", { exact: true })).toBeVisible();
    await expect(output.getByText(/^Pinned /u)).toHaveCount(0);
    await page.goto(`${fixture.runtime.url}/manage/data`);
    await sources.getByRole("button", { name: "Rebind Pinned followers", exact: true }).click();
    await sources.getByRole("combobox", { name: "Pinned Twitch goal" }).selectOption("goal-replacement");
    await sources.getByRole("button", { name: "Save Creator Goal rebind" }).click();
    await expect(output.getByText("Pinned 5", { exact: true })).toBeVisible();
    // Authoritative restart reconciles persisted bindings rather than replaying ended goals.
    await fixture.stop(); await fixture.start(); await output.reload();
    await expect(output.getByText("Live 5", { exact: true })).toBeVisible();
    fixture.goals = [{ ...replacement, broadcaster_id: "synthetic-other" }];
    await fixture.connect(true, "synthetic-other"); await output.reload();
    await expect.poll(async () => (await status()).goals.bindings.map(binding => binding.state)).toEqual(["invalid", "invalid"]);
    await expect(output.locator("[data-element-id]")).toHaveCount(0);
    fixture.goals = [replacement]; await fixture.connect(true); await output.reload();
    await expect.poll(async () => (await status()).goals.bindings.map(binding => binding.state)).toEqual(["invalid", "invalid"]);
    await expect(output.locator("[data-element-id]")).toHaveCount(0);
    await page.reload(); await sources.getByRole("button", { name: "Rebind Live followers", exact: true }).click();
    await sources.getByRole("button", { name: "Save Creator Goal rebind" }).click();
    await expect(output.getByText("Live 5", { exact: true })).toBeVisible();
    await expect(output.getByText(/^Pinned /u)).toHaveCount(0);
    await output.close();
  } finally { await fixture.close(); }
});
