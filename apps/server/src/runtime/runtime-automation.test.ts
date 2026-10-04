import { createDefaultAppConfig } from "../config/default-config.js";
import { FileConfigStore } from "../config/file-config-store.js";
import type { ConfigStore } from "@stream-jams/core";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { createRuntimeAppComposition } from "./runtime-composition.js";

it("pairs through real management security and controls a disposable runtime", async () => {
 const root = await mkdtemp(join(tmpdir(), "stream-jams-scoped-automation-"));
 const composition = await createRuntimeAppComposition({ homeDirectory: root, webBuildDirectory: await createWebBuildFixture(root), environment: {}, secretStore: new InMemorySecretStore() });
 try {
  const app = composition.app; const verifier = "a".repeat(43); const native = { host: "127.0.0.1:39187" };
  const scopes = ["timers:read", "timers:control", "playback:read", "playback:pause:alerts", "playback:skip:alerts", "playback:clear:alerts", "playback:mute:alerts"];
  const pairing = await app.inject({ method: "POST", url: "/automation/v1/pairings", headers: native, payload: { clientName: "Runtime acceptance", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url") } }); expect(pairing.statusCode, pairing.body).toBe(201);
  const id = pairing.json().id as string;
  const session = (await app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  const management = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  const approve = `/api/automation/pairings/${id}/approve`;
  expect((await app.inject({ method: "POST", url: approve, payload: { scopes } })).statusCode).toBe(401);
  expect((await app.inject({ method: "POST", url: approve, headers: { authorization: management.authorization }, payload: { scopes } })).statusCode).toBe(403);
  const approved = await app.inject({ method: "POST", url: approve, headers: management, payload: { scopes } }); expect(approved.statusCode, approved.body).toBe(200);
  const exchange = await app.inject({ method: "POST", url: `/automation/v1/pairings/${id}/exchange`, headers: native, payload: { verifier } }); expect(exchange.statusCode, exchange.body).toBe(200);
  const token = exchange.json().token as string; const machine = { ...native, authorization: `Bearer ${token}` };
  const capabilities = await app.inject({ url: "/automation/v1/capabilities", headers: machine }); expect(capabilities.statusCode).toBe(200); expect(capabilities.json().capabilities).toEqual(scopes);
  const state = (await app.inject({ url: "/automation/v1/state", headers: machine })).json(); const runtimeId = state.runtimeId as string;
  const timerInput = { label: "Acceptance timer", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: [] };
  const create = await app.inject({ method: "POST", url: "/timers", headers: management, payload: timerInput }); expect(create.statusCode, create.body).toBe(201); const timerId = create.json().id as string;
  const command = (path: string, input: Record<string, unknown>) => app.inject({ method: "POST", url: `/automation/v1/${path}`, headers: machine, payload: { observedRuntimeId: runtimeId, ...input } });
  expect((await command(`timers/${timerId}/activate`, { observedRuntimeId: "prior-runtime", expectedGeneration: null })).statusCode).toBe(409);
  const activated = await command(`timers/${timerId}/activate`, { expectedGeneration: null }); expect(activated.statusCode, activated.body).toBe(200);
  const generation = activated.json().state.timers.find((t: { id: string }) => t.id === timerId).state.generation as string;
  expect((await command(`timers/${timerId}/reset`, { expectedGeneration: "prior-generation" })).statusCode).toBe(409);
  expect((await command("timers/toggle-pause", {})).statusCode).toBe(200);
  const saved = await app.inject({ method: "PUT", url: `/timers/${timerId}`, headers: management, payload: { ...timerInput, durationMs: 120_000 } }); expect(saved.statusCode, saved.body).toBe(200);
  const reset = await command(`timers/${timerId}/reset`, { expectedGeneration: generation }); expect(reset.statusCode, reset.body).toBe(200);
  expect(composition.timerRuntimeCoordinator.getState(timerId)).toMatchObject({ status: "paused", generation, remainingMs: 120_000, snapshot: { durationMs: 120_000 } });
  const adjust = await command(`timers/${timerId}/adjust`, { expectedGeneration: generation, action: "decrement", amountMs: 30_000 }); expect(adjust.statusCode, adjust.body).toBe(200); expect(composition.timerRuntimeCoordinator.getState(timerId)).toMatchObject({ remainingMs: 90_000 });
  expect((await command(`timers/${timerId}/stop`, { expectedGeneration: generation })).statusCode).toBe(200); expect(composition.timerRuntimeCoordinator.getState(timerId)).toBeNull();
  const paused = await command("playback/alerts/toggle-pause", {}); expect(paused.statusCode, paused.body).toBe(200);
  const owner = paused.json().state.playback.find((p: { moduleId: string }) => p.moduleId === "alerts"); expect(owner.paused).toBe(true);
  const clear = await command("playback/alerts/clear", { expectedQueueRevision: owner.queueRevision, expectedPendingCount: 0 }); expect(clear.statusCode, clear.body).toBe(200); expect(clear.json().changed).toBe(false);
  expect((await command("playback/alerts/clear", { expectedQueueRevision: "0".repeat(64), expectedPendingCount: 0 })).statusCode).toBe(409);
  expect((await command("playback/alerts/skip", { expectedOccurrenceId: null })).json().changed).toBe(false);
  expect((await command("playback/screen-effects/toggle-pause", {})).statusCode).toBe(403);
  const set = await app.inject({ method: "POST", url: "/management/alert-sets", headers: management, payload: { name: "Acceptance set" } }); expect(set.statusCode, set.body).toBe(201);
  composition.database.connection.prepare("UPDATE alert_collections SET enabled = 1").run();
  const backup = await app.inject({ url: "/management/settings/backup", headers: management }); expect(backup.statusCode, backup.body).toBe(200); expect(backup.json().configuration.tables).not.toHaveProperty("automation_grants"); expect(backup.body).not.toContain(token);
  const revoked = await app.inject({ method: "POST", url: `/api/automation/grants/${exchange.json().grant.id}/revoke`, headers: management, payload: {} }); expect(revoked.statusCode).toBe(200); expect((await app.inject({ url: "/automation/v1/state", headers: machine })).statusCode).toBe(401);
 } finally { await composition.close(); await rm(root, { recursive: true, force: true }); }
});
async function createWebBuildFixture(testRoot: string): Promise<string> {
  const webBuildDirectory = join(testRoot, "web-dist");
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.js"), "console.log('runtime smoke');", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "index-smoke.css"), "body { color: black; }", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "management-smoke.js"), "export {};", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "operator-smoke.js"), "export {};", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "overlay-smoke.js"), "export {};", "utf8");
  await writeFile(
    join(webBuildDirectory, ".vite", "manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/index-smoke.js",
        isEntry: true,
        css: ["assets/index-smoke.css"],
        dynamicImports: ["src/App.tsx", "src/operator/OperatorApp.tsx", "src/overlay/OverlayApp.tsx"]
      },
      "src/App.tsx": {
        file: "assets/management-smoke.js",
        src: "src/App.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      },
      "src/operator/OperatorApp.tsx": {
        file: "assets/operator-smoke.js",
        src: "src/operator/OperatorApp.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      },
      "src/overlay/OverlayApp.tsx": {
        file: "assets/overlay-smoke.js",
        src: "src/overlay/OverlayApp.tsx",
        isDynamicEntry: true,
        imports: ["index.html"]
      }
    }),
    "utf8"
  );

  return webBuildDirectory;
}





it("persists claimed grants across restart and invalidates credentials, pairings and runtime guards on restore", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-automation-lifecycle-"));
  const options = { homeDirectory: root, webBuildDirectory: await createWebBuildFixture(root), environment: {}, secretStore: new InMemorySecretStore() };
  let composition = await createRuntimeAppComposition(options);
  const native = { host: "127.0.0.1:39187" };
  const scopes = ["timers:read", "timers:control"];
  const verifier = "b".repeat(43);
  async function managementHeaders() {
    const response = await composition.app.inject({ method: "POST", url: "/auth/management/sessions" });
    expect(response.statusCode, response.body).toBe(201);
    const session = response.json() as { id: string; csrfToken: string };
    return { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  }
  async function approvePairing(headers: Awaited<ReturnType<typeof managementHeaders>>) {
    const response = await composition.app.inject({ method: "POST", url: "/automation/v1/pairings", headers: native, payload: {
      clientName: "Lifecycle acceptance", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url")
    } });
    expect(response.statusCode, response.body).toBe(201);
    const pairing = response.json() as { id: string };
    const approval = await composition.app.inject({ method: "POST", url: `/api/automation/pairings/${pairing.id}/approve`, headers, payload: { scopes } });
    expect(approval.statusCode, approval.body).toBe(200);
    return pairing;
  }
  async function exchange(pairingId: string) {
    const response = await composition.app.inject({ method: "POST", url: `/automation/v1/pairings/${pairingId}/exchange`, headers: native, payload: { verifier } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { token: string; grant: { id: string } };
  }
  async function state(token: string) {
    const response = await composition.app.inject({ url: "/automation/v1/state", headers: { ...native, authorization: `Bearer ${token}` } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { runtimeId: string };
  }
  try {
    let management = await managementHeaders();
    const credential = await exchange((await approvePairing(management)).id);
    const initialState = await state(credential.token); // First real authenticated use claims the persisted grant.
    const timerInput = { label: "Lifecycle timer", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: [] };
    const created = await composition.app.inject({ method: "POST", url: "/timers", headers: management, payload: timerInput });
    expect(created.statusCode, created.body).toBe(201);
    const timerId = (created.json() as { id: string }).id;
    await composition.close();
    composition = await createRuntimeAppComposition(options);
    management = await managementHeaders();
    const restartedState = await state(credential.token);
    expect(restartedState.runtimeId).not.toBe(initialState.runtimeId);
    const persistedGrants = await composition.app.inject({ url: "/api/automation/grants", headers: management });
    expect(persistedGrants.statusCode, persistedGrants.body).toBe(200);
    expect(persistedGrants.json()).toContainEqual(expect.objectContaining({ id: credential.grant.id, revokedAt: null, scopes }));
    const machine = { ...native, authorization: `Bearer ${credential.token}` };
    const oldRuntime = await composition.app.inject({ method: "POST", url: `/automation/v1/timers/${timerId}/activate`, headers: machine, payload: { observedRuntimeId: initialState.runtimeId, expectedGeneration: null } });
    expect(oldRuntime.statusCode, oldRuntime.body).toBe(409);
    expect(oldRuntime.json()).toMatchObject({ error: { code: "AUTOMATION_RUNTIME_CHANGED" } });
    expect(composition.timerRuntimeCoordinator.getState(timerId)).toBeNull();

    const pending = await approvePairing(management);
    const set = await composition.app.inject({ method: "POST", url: "/management/alert-sets", headers: management, payload: { name: "Lifecycle backup set" } });
    expect(set.statusCode, set.body).toBe(201);
    composition.database.connection.prepare("UPDATE alert_collections SET enabled = 1").run();
    const exported = await composition.app.inject({ url: "/management/settings/backup", headers: management });
    expect(exported.statusCode, exported.body).toBe(200);
    const archive = exported.json();
    const preflight = await composition.app.inject({ method: "POST", url: "/management/settings/backup/preflight", headers: management, payload: archive });
    expect(preflight.statusCode, preflight.body).toBe(200);
    expect(preflight.json().state).toBe("valid");
    const restored = await composition.app.inject({ method: "POST", url: "/management/settings/backup/restore", headers: management, payload: { archive, archiveId: preflight.json().archiveId, confirmation: "RESTORE", regenerateRouteKeys: true } });
    expect(restored.statusCode, restored.body).toBe(200);
    expect((await composition.app.inject({ url: "/automation/v1/state", headers: machine })).statusCode).toBe(401);
    const staleExchange = await composition.app.inject({ method: "POST", url: `/automation/v1/pairings/${pending.id}/exchange`, headers: native, payload: { verifier } });
    expect(staleExchange.statusCode, staleExchange.body).toBe(404);
    const staleStatus = await composition.app.inject({ method: "POST", url: `/automation/v1/pairings/${pending.id}/status`, headers: native, payload: { verifier } });
    expect(staleStatus.statusCode, staleStatus.body).toBe(404);
    management = await managementHeaders();
    const afterRestoreGrants = await composition.app.inject({ url: "/api/automation/grants", headers: management });
    expect(afterRestoreGrants.statusCode, afterRestoreGrants.body).toBe(200);
    expect(afterRestoreGrants.json()).toEqual([]);
    const afterRestorePairings = await composition.app.inject({ url: "/api/automation/pairings", headers: management });
    expect(afterRestorePairings.statusCode, afterRestorePairings.body).toBe(200);
    expect(afterRestorePairings.json()).toEqual([]);
    const newCredential = await exchange((await approvePairing(management)).id);
    const restoredState = await state(newCredential.token);
    expect(restoredState.runtimeId).not.toBe(restartedState.runtimeId);
    const newMachine = { ...native, authorization: `Bearer ${newCredential.token}` };
    const preRestoreCommand = await composition.app.inject({ method: "POST", url: `/automation/v1/timers/${timerId}/activate`, headers: newMachine, payload: { observedRuntimeId: restartedState.runtimeId, expectedGeneration: null } });
    expect(preRestoreCommand.statusCode, preRestoreCommand.body).toBe(409);
    expect(preRestoreCommand.json()).toMatchObject({ error: { code: "AUTOMATION_RUNTIME_CHANGED" } });
    expect(composition.timerRuntimeCoordinator.getState(timerId)).toBeNull();
    const validCommand = await composition.app.inject({ method: "POST", url: `/automation/v1/timers/${timerId}/activate`, headers: newMachine, payload: { observedRuntimeId: restoredState.runtimeId, expectedGeneration: null } });
    expect(validCommand.statusCode, validCommand.body).toBe(200);
    expect(composition.timerRuntimeCoordinator.getState(timerId)).toMatchObject({ status: "running" });
  } finally {
    await composition.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects both revoke routes during an actual failed restore and preserves successful revocation across rollback", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-revocation-restore-"));
  const fileStore = new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: createDefaultAppConfig(root) });
  let failRestore = false;
  let entered = () => {};
  let release = () => {};
  const enteredRestore = new Promise<void>(resolve => { entered = resolve; });
  const releaseRestore = new Promise<void>(resolve => { release = resolve; });
  const configStore: ConfigStore = {
    readConfig: () => fileStore.readConfig(),
    async updateConfig(patch) {
      if (failRestore) {
        failRestore = false; entered(); await releaseRestore;
        throw new Error("Injected configuration write failure to exercise real restore rollback");
      }
      return fileStore.updateConfig(patch);
    }
  };
  const composition = await createRuntimeAppComposition({ homeDirectory: root, webBuildDirectory: await createWebBuildFixture(root), environment: {}, secretStore: new InMemorySecretStore(), configStore });
  try {
    const app = composition.app;
    const native = { host: "127.0.0.1:39187" };
    const sessionResponse = await app.inject({ method: "POST", url: "/auth/management/sessions" });
    const session = sessionResponse.json() as { id: string; csrfToken: string };
    const management = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    const scopes = ["timers:read"];
    const verifier = "c".repeat(43);
    async function pair() {
      const pairing = await app.inject({ method: "POST", url: "/automation/v1/pairings", headers: native, payload: { clientName: "Restore race", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url") } });
      expect(pairing.statusCode, pairing.body).toBe(201);
      const approved = await app.inject({ method: "POST", url: `/api/automation/pairings/${pairing.json().id}/approve`, headers: management, payload: { scopes } });
      expect(approved.statusCode, approved.body).toBe(200);
      const exchanged = await app.inject({ method: "POST", url: `/automation/v1/pairings/${pairing.json().id}/exchange`, headers: native, payload: { verifier } });
      expect(exchanged.statusCode, exchanged.body).toBe(200);
      return exchanged.json() as { token: string; grant: { id: string } };
    }
    const active = await pair();
    const alreadyRevoked = await pair();
    const unclaimed = await pair();
    const machine = { ...native, authorization: `Bearer ${active.token}` };
    expect((await app.inject({ url: "/automation/v1/state", headers: machine })).statusCode).toBe(200);
    const success = await app.inject({ method: "POST", url: `/api/automation/grants/${alreadyRevoked.grant.id}/revoke`, headers: management, payload: {} });
    expect(success.statusCode, success.body).toBe(200); expect(success.json()).toEqual({ revoked: true });
    const revokedRecord = composition.database.connection.prepare("SELECT * FROM automation_grants WHERE id = ?").get(alreadyRevoked.grant.id);
    const set = await app.inject({ method: "POST", url: "/management/alert-sets", headers: management, payload: { name: "Restore race backup" } });
    expect(set.statusCode, set.body).toBe(201);
    composition.database.connection.prepare("UPDATE alert_collections SET enabled = 1").run();
    const archiveResponse = await app.inject({ url: "/management/settings/backup", headers: management });
    expect(archiveResponse.statusCode, archiveResponse.body).toBe(200);
    const archive = archiveResponse.json();
    const preflight = await app.inject({ method: "POST", url: "/management/settings/backup/preflight", headers: management, payload: archive });
    expect(preflight.json().state).toBe("valid");
    failRestore = true;
    const restoring = app.inject({ method: "POST", url: "/management/settings/backup/restore", headers: management, payload: { archive, archiveId: preflight.json().archiveId, confirmation: "RESTORE", regenerateRouteKeys: true } });
    await enteredRestore;
    try {
      const during = composition.database.connection.prepare("SELECT * FROM automation_grants ORDER BY id").all();
      for (const response of [
        await app.inject({ method: "POST", url: `/api/automation/grants/${active.grant.id}/revoke`, headers: management, payload: {} }),
        await app.inject({ method: "POST", url: "/automation/v1/grants/self/revoke", headers: machine, payload: {} }),
        await app.inject({ url: "/api/automation/grants", headers: management }),
        await app.inject({ url: "/automation/v1/state", headers: { ...native, authorization: `Bearer ${unclaimed.token}` } })
      ]) {
        expect(response.statusCode, response.body).toBe(409);
        expect(response.json()).toMatchObject({ error: { code: "AUTOMATION_MAINTENANCE_ACTIVE" } });
      }
      expect(composition.database.connection.prepare("SELECT * FROM automation_grants ORDER BY id").all()).toEqual(during);
    } finally { release(); }
    const failed = await restoring;
    expect(failed.statusCode, failed.body).toBe(409);
    expect(failed.json()).toMatchObject({ error: { code: "RESTORE_FAILED" } });
    expect(composition.database.connection.prepare("SELECT * FROM automation_grants WHERE id = ?").get(alreadyRevoked.grant.id)).toEqual(revokedRecord);
    expect((await app.inject({ url: "/automation/v1/state", headers: { ...native, authorization: `Bearer ${alreadyRevoked.token}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/automation/v1/state", headers: machine })).statusCode).toBe(200);
    const after = await app.inject({ method: "POST", url: "/automation/v1/grants/self/revoke", headers: machine, payload: {} });
    expect(after.statusCode, after.body).toBe(200); expect(after.json()).toEqual({ revoked: true });
    expect((await app.inject({ url: "/automation/v1/state", headers: machine })).statusCode).toBe(401);
  } finally {
    release(); await composition.close(); await rm(root, { recursive: true, force: true });
  }
});
