import { afterEach, expect, it } from "vitest";
import { configurationBackupArchiveSchema, type ProviderRegistrationAttempt } from "@stream-jams/core";
import { createProviderSecurityRuntimeFixture } from "../test-support/provider-security-runtime-fixture.js";
import { startProviderFixture, waitForProvider } from "../test-support/provider-websocket-fixture.js";
import { SqliteConfigurationSnapshotRepository } from "../modules/backup/sqlite-configuration-snapshot-repository.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture() {
  const runtime = await createProviderSecurityRuntimeFixture();
  cleanups.push(runtime.close);
  await runtime.start();
  return runtime;
}

async function register(runtime: Awaited<ReturnType<typeof fixture>>, port: number, password?: string) {
  const response = await runtime.request("/management/providers", "POST", { name: "Lifecycle Streamer.bot", kind: "streamerbot", configuration: {
    protocol: "ws", host: "127.0.0.1", port, endpoint: "/", allowUnauthenticatedLocalConnection: password === undefined
  }, ...(password === undefined ? {} : { credential: password }) });
  expect(response.status, await response.clone().text()).toBe(201);
  const attempt = await response.json() as ProviderRegistrationAttempt;
  if (attempt.status !== "registered") throw new Error("Provider registration did not complete");
  return attempt.provider.provider.id;
}

it("authenticates real sockets, persists restart state, and fails closed when the stored password disappears", async () => {
  const peer = await startProviderFixture({ kind: "streamerbot", password: "synthetic-lifecycle-password" });
  cleanups.push(peer.close);
  const runtime = await fixture();
  const id = await register(runtime, peer.port, "synthetic-lifecycle-password");
  await waitForProvider(() => peer.requests.some(request => request.message.request === "Subscribe"), "authenticated runtime subscription");
  expect(peer.requests.filter(request => request.message.request === "Authenticate").length).toBeGreaterThanOrEqual(2);
  peer.send({ timeStamp: "2026-10-03T12:00:00.000Z", event: { source: "Twitch", type: "Follow" }, data: { targetUser: { id: "lifecycle-user", login: "lifecycle", name: "Lifecycle" }, followedAt: "2026-10-03T12:00:00.000Z" } });
  await waitForProvider(() => Number(runtime.runtime.composition.database.connection.prepare("SELECT COUNT(*) AS count FROM event_logs").get()?.count) > 0, "persisted intake event");
  const secrets = [...runtime.secretStore.values];
  expect(secrets).toHaveLength(1);
  const connections = peer.connections.length;
  const subscriptionCount = peer.requests.filter(request => request.message.request === "Subscribe").length;
  await runtime.stop();
  await runtime.start();
  await waitForProvider(() => peer.connections.length > connections, "password reconnect after restart");
  await waitForProvider(() => peer.requests.filter(request => request.message.request === "Subscribe").length > subscriptionCount, "authenticated subscription after restart");
  const eventCount = Number(runtime.runtime.composition.database.connection.prepare("SELECT COUNT(*) AS count FROM event_logs").get()?.count);
  peer.send({ timeStamp: "2026-10-03T12:01:00.000Z", event: { source: "Twitch", type: "Follow" }, data: { targetUser: { id: "restart-user", login: "restart", name: "Restart" }, followedAt: "2026-10-03T12:01:00.000Z" } });
  await waitForProvider(() => Number(runtime.runtime.composition.database.connection.prepare("SELECT COUNT(*) AS count FROM event_logs").get()?.count) > eventCount, "postrestart intake");
  expect(runtime.secretStore.values.size).toBe(1);
  const response = await runtime.request(`/management/providers/${id}`);
  expect(await response.text()).not.toContain("synthetic-lifecycle-password");
  await runtime.stop();
  runtime.secretStore.values.clear();
  const beforeMissingSecret = peer.connections.length;
  await runtime.start();
  expect(peer.connections).toHaveLength(beforeMissingSecret);
  expect(runtime.runtime.composition.streamerBotRuntimeService.getStatus()).toMatchObject({ state: "error", message: "Streamer.bot password is unavailable" });
  runtime.secretStore.values.set(secrets[0]![0], secrets[0]![1]);
  await runtime.runtime.composition.syncEventSourceRuntime();
  expect(runtime.runtime.composition.streamerBotRuntimeService.getStatus().connectionState).toBe("connected");
  const replacement = await register(runtime, peer.port, "synthetic-lifecycle-password");
  expect((await runtime.request(`/management/providers/${replacement}/activate`, "POST", { confirmWarnings: true })).status).toBe(200);
  expect(runtime.secretStore.values.size).toBe(2);
  expect(runtime.secretStore.values.get(secrets[0]![0])).toBe("synthetic-lifecycle-password");
  expect(await (await runtime.request(`/management/providers/${id}`)).json()).toMatchObject({ provider: { active: false } });
  const beforeFailure = [...runtime.secretStore.values];
  runtime.runtime.composition.database.connection.exec("CREATE TRIGGER reject_security_provider BEFORE INSERT ON provider_registrations BEGIN SELECT RAISE(ABORT, 'owned registration persistence failure'); END");
  const failedRegistration = await runtime.request("/management/providers", "POST", { name: "Failed registration", kind: "streamerbot", configuration: { protocol: "ws", host: "127.0.0.1", port: peer.port, endpoint: "/" }, credential: "synthetic-lifecycle-password" });
  expect(failedRegistration.status).toBe(500);
  expect(await failedRegistration.text()).not.toContain("synthetic-lifecycle-password");
  expect([...runtime.secretStore.values]).toEqual(beforeFailure);
  await runtime.stop();
  expect(await runtime.readLogs()).not.toContain("synthetic-lifecycle-password");
}, 30_000);

it("never dials unsafe legacy rows or missing-consent rows and exposes only safe management errors", async () => {
  const peer = await startProviderFixture({ kind: "streamerbot" });
  cleanups.push(peer.close);
  const runtime = await fixture();
  const id = await register(runtime, peer.port);
  const unsafe = [
    { host: "user:credential-sentinel@example.com", endpoint: "/", allowUnauthenticatedLocalConnection: true },
    { host: "127.0.0.1", endpoint: "/?token=credential-sentinel", allowUnauthenticatedLocalConnection: true },
    { host: "127.0.0.1", endpoint: "/" }
  ];
  for (const settings of unsafe) {
    const connectionCount = peer.connections.length;
    runtime.runtime.composition.database.connection.prepare("UPDATE provider_registrations SET non_secret_config_json = ? WHERE id = ?").run(JSON.stringify({ protocol: "ws", port: peer.port, ...settings }), id);
    await runtime.stop();
    await runtime.start();
    expect(peer.connections).toHaveLength(connectionCount);
    expect(runtime.runtime.composition.streamerBotRuntimeService.getStatus().state).toBe("error");
    for (const path of ["/management/providers?capability=event-source", `/management/providers/${id}`, "/management/diagnostics/workspace"]) {
      const response = await runtime.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain("credential-sentinel");
    }
    if (settings.host.includes("@") || settings.endpoint.includes("?")) {
      const backup = await runtime.request("/management/settings/backup");
      expect(backup.status).toBeGreaterThanOrEqual(400);
      expect(await backup.text()).not.toContain("credential-sentinel");
    }
  }
  const connections = peer.connections.length;
  const replacement = await register(runtime, peer.port);
  expect(replacement).not.toBe(id);
  const activated = await runtime.request(`/management/providers/${replacement}/activate`, "POST", { confirmWarnings: true });
  expect(activated.status).toBe(200);
  expect(peer.connections.length).toBeGreaterThan(connections);
  expect(runtime.runtime.composition.streamerBotRuntimeService.getStatus().connectionState).toBe("connected");
  await runtime.stop();
  expect(await runtime.readLogs()).not.toContain("credential-sentinel");
}, 30_000);

it("exports portable consent without secrets, restores into a second runtime, and rejects unsafe imports without mutation", async () => {
  const peer = await startProviderFixture({ kind: "streamerbot" });
  cleanups.push(peer.close);
  const runtime = await fixture();
  const id = await register(runtime, peer.port);
  const authenticatedPeer = await startProviderFixture({ kind: "streamerbot", password: "backup-password-sentinel" });
  cleanups.push(authenticatedPeer.close);
  const authenticatedId = await register(runtime, authenticatedPeer.port, "backup-password-sentinel");
  expect((await runtime.request(`/management/providers/${authenticatedId}/activate`, "POST", { confirmWarnings: true })).status).toBe(200);
  const set = await runtime.request("/management/alert-sets", "POST", { name: "Lifecycle backup set" });
  expect(set.status).toBe(201);
  const setBody = await set.json() as { id: string };
  // Backup needs an active set; no playback is enabled in this portable fixture.
  runtime.runtime.composition.database.connection.prepare("UPDATE alert_collections SET enabled = CASE WHEN id = ? THEN 1 ELSE 0 END").run(setBody.id);
  const backupResponse = await runtime.request("/management/settings/backup");
  expect(backupResponse.status, await backupResponse.clone().text()).toBe(200);
  const archive = configurationBackupArchiveSchema.parse(await backupResponse.json());
  expect(JSON.stringify(archive)).not.toContain("secret_ref_json");
  expect(JSON.stringify(archive)).not.toContain("backup-password-sentinel");
  expect(archive.configuration.tables.provider_registrations?.some(row => String(row.non_secret_config_json).includes('"allowUnauthenticatedLocalConnection":true'))).toBe(true);
  const target = await fixture();
  const targetSet = await target.request("/management/alert-sets", "POST", { name: "Restore safety prerequisite" });
  expect(targetSet.status).toBe(201);
  const targetSetBody = await targetSet.json() as { id: string };
  target.runtime.composition.database.connection.prepare("UPDATE alert_collections SET enabled = CASE WHEN id = ? THEN 1 ELSE 0 END").run(targetSetBody.id);
  const preflight = await target.request("/management/settings/backup/preflight", "POST", archive);
  const validated = await preflight.json() as { state: string; archiveId: string };
  expect(validated.state, JSON.stringify(validated)).toBe("valid");
  const restored = await target.request("/management/settings/backup/restore", "POST", { archive, archiveId: validated.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
  expect(restored.status, await restored.clone().text()).toBe(200);
  expect(target.secretStore.values.size).toBe(0);
  const readback = await target.request(`/management/providers/${id}`);
  expect(await readback.json()).toMatchObject({ configuration: { allowUnauthenticatedLocalConnection: true } });
  const snapshots = new SqliteConfigurationSnapshotRepository(target.runtime.composition.database.connection);
  const before = snapshots.captureRestorePoint();
  const unsafe = structuredClone(archive);
  const row = unsafe.configuration.tables.provider_registrations?.[0];
  if (row === undefined) throw new Error("Backup has no provider row");
  row.non_secret_config_json = JSON.stringify({ protocol: "ws", host: "user:credential-sentinel@example.com", port: peer.port, endpoint: "/" });
  const rejection = await target.request("/management/settings/backup/preflight", "POST", unsafe);
  const rejected = await rejection.text();
  expect(JSON.parse(rejected)).toMatchObject({ state: "invalid" });
  expect(rejected).not.toContain("credential-sentinel");
  const restoreRejected = await target.request("/management/settings/backup/restore", "POST", { archive: unsafe, archiveId: validated.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
  expect(restoreRejected.status).toBe(409);
  expect(await restoreRejected.text()).not.toContain("credential-sentinel");
  expect(snapshots.captureRestorePoint()).toEqual(before);
  await target.stop();
  await runtime.stop();
  expect(await runtime.readLogs()).not.toContain("backup-password-sentinel");
  await target.start();
  expect(target.secretStore.values.size).toBe(0);
  expect(target.runtime.composition.streamerBotRuntimeService.getStatus().state).toBe("error");
}, 30_000);
