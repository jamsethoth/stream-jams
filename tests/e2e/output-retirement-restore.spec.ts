import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigurationBackupArchive, ConfigurationRestorePreflight, ConfigurationRestoreResult } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { ConfigurationBackupService } from "../../apps/server/src/modules/backup/configuration-backup-service.js";
import { SqliteConfigurationSnapshotRepository } from "../../apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.js";
import { createPreMigrationDatabase } from "../../apps/server/src/test-support/pre-migration-database.js";
import { createProviderSecurityRuntimeFixture, createProviderSocket } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
const standard = [
  ...["alerts", "music", "timers"].flatMap(moduleId => ["landscape", "vertical"].map(targetProfileId => ({ moduleId, targetProfileId }))),
  { moduleId: "videos", targetProfileId: null }, { moduleId: "screen-effects", targetProfileId: null }
];
const hash = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const childUrl = (base: string, suffix: string) => { const url = new URL(base); url.pathname += suffix; return url.href; };
const socketUrl = (base: string) => { const url = new URL(base); url.protocol = "ws:"; url.pathname = url.pathname.replace("/overlay/", "/overlay/ws/"); return url.href; };
async function connect(base: string) {
  const socket = createProviderSocket(socketUrl(base));
  const closed = new Promise<number>(resolve => socket.once("close", code => resolve(code)));
  const first = await new Promise<{ type: string }>((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("Overlay connection timed out")); }, 5000);
    socket.once("message", data => { clearTimeout(timer); resolve(JSON.parse(String(data)) as { type: string }); });
    socket.once("error", error => { clearTimeout(timer); reject(error); });
  });
  return { socket, closed, first };
}
async function checkedJson<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<T>;
}

test("historical credentials retire atomically; ordinary profiles, transparent shells and repeated restore remain safe", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await createProviderSecurityRuntimeFixture();
  const ordinaryRows: unknown[] = [];
  try {
    using old = createPreMigrationDatabase("047-retire-public-overlays");
    const keys = [...standard, { moduleId: "timers", targetProfileId: null }, { moduleId: "music", targetProfileId: "landscape", purpose: "test" }, { moduleId: null, targetProfileId: null, scope: "unified" }];
    for (const [index, output] of keys.entries()) {
      const ref = { namespace: "overlay" as const, accountId: `historical-${index}`, name: "route-key" };
      await fixture.secretStore.setSecret(ref, `ovl_fixture_${index}`);
      old.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,route_key_secret_ref_json,created_at,target_profile_id) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(ref.accountId, "default", output.moduleId, "purpose" in output ? output.purpose : "live", "scope" in output ? output.scope : "module", hash(`ovl_fixture_${index}`), JSON.stringify(ref), "2026-10-11T00:00:00Z", output.targetProfileId);
      if (index < 9) ordinaryRows.push(old.connection.prepare("SELECT * FROM overlay_keys WHERE id=?").get(ref.accountId));
    }
    const desktop = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "local-monitor", displayLabel: "Saved monitor", autoFollowDisplayName: true, opacity: 0.4,
      layers: [{ moduleId: "timers", visible: true }, { moduleId: "alerts", visible: false }, { moduleId: "music", visible: true }, { moduleId: "videos", visible: false }, { moduleId: "screen-effects", visible: true }] };
    old.connection.prepare("UPDATE overlay_surfaces SET configuration_json=? WHERE id='desktop:primary'").run(JSON.stringify(desktop));
    const retiredSurface = { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "timers", visible: true }] };
    old.connection.prepare("INSERT INTO overlay_surfaces VALUES (?,?,?,?)").run(retiredSurface.id, retiredSurface.kind, JSON.stringify(retiredSurface), "2026-10-11T00:00:00Z");
    for (const [id, filename, type, mime] of [["tiny", "tiny-video.mp4", "video", "video/mp4"], ["font", "fixture.woff2", "font", "font/woff2"]] as const) {
      const bytes = await readFile(id === "tiny" ? "apps/web/public/storybook-assets/tiny-video.mp4" : "apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2");
      await mkdir(join(fixture.homeDirectory, ".stream-jams", "assets", type), { recursive: true });
      await writeFile(join(fixture.homeDirectory, ".stream-jams", "assets", type, filename), bytes);
      old.connection.prepare("INSERT INTO asset_metadata (id,original_file_name,media_type,mime_type,size_bytes,checksum,storage_path,duration_ms) VALUES (?,?,?,?,?,?,?,NULL)").run(id, filename, type, mime, bytes.length, hash(bytes), `${type}/${filename}`);
    }
    await mkdir(join(fixture.homeDirectory, ".stream-jams", "data"), { recursive: true });
    old.connection.prepare("VACUUM INTO ?").run(join(fixture.homeDirectory, ".stream-jams", "data", "stream-jams.sqlite"));
    await fixture.start();
    const db = fixture.runtime.composition.database.connection;
    expect(db.prepare("SELECT * FROM overlay_keys WHERE revoked_at IS NULL ORDER BY id").all()).toEqual([...ordinaryRows].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))));
    expect(JSON.parse(String(db.prepare("SELECT configuration_json FROM overlay_surfaces WHERE id='desktop:primary'").get()?.configuration_json))).toEqual(desktop);
    expect(db.prepare("SELECT * FROM overlay_surfaces WHERE kind='unified-browser'").all()).toEqual([]);
    for (const [index, output] of standard.entries()) {
      const url = `${fixture.runtime.url}/overlay/modules/${output.moduleId}/live/ovl_fixture_${index}${output.targetProfileId === null ? "" : `?profile=${output.targetProfileId}`}`;
      expect((await fetch(url)).status).toBe(200);
      expect((await fetch(childUrl(url, "/composition"))).status).toBe(200);
      for (const asset of ["tiny", "font"]) expect((await fetch(childUrl(url, `/assets/${asset}`), { headers: { range: "bytes=0-15" } })).status).toBe(206);
      const client = await connect(url); expect(client.first.type).toBe("overlay.connected"); client.socket.close();
      expect((await fetch(childUrl(url, "/composition") + (output.targetProfileId === null ? "?recipientKind=desktop" : "&recipientKind=desktop"))).status).toBe(401);
    }
    const legacyUrl = `${fixture.runtime.url}/overlay/modules/timers/live/ovl_fixture_8`;
    expect((await fetch(childUrl(legacyUrl, "/composition"))).status).toBe(200);
    expect((await fetch(childUrl(legacyUrl, "/composition") + "?profile=landscape")).status).toBe(401);
    const retired = [`${fixture.runtime.url}/overlay/modules/music/test/ovl_fixture_9?profile=landscape`, `${fixture.runtime.url}/overlay/unified/live/ovl_fixture_10`, `${fixture.runtime.url}/overlay/unified/test`, `${fixture.runtime.url}/overlay/modules/music/live/wrong?profile=landscape`];
    for (const url of retired) {
      const response = await page.goto(url); expect(response?.status()).toBe(401);
      expect(await page.locator("body").innerText()).toBe(""); expect(await page.locator("script").count()).toBe(0);
      expect(await page.locator("body").evaluate(body => getComputedStyle(body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      if (url.endsWith("/test")) continue;
      for (const suffix of ["/composition", "/assets/tiny", "/assets/font", url.includes("/unified/") ? "/music/artwork/current" : "/artwork/current"]) {
        const denied = await fetch(childUrl(url, suffix), { headers: { range: "bytes=0-15" } }); expect(denied.status).toBe(401); expect(denied.headers.get("content-range")).toBeNull();
      }
      const client = await connect(url); expect(await client.closed).toBe(1008);
    }
    await checkedJson(await fixture.request("/management/alert-sets"));
    const archive = await checkedJson<ConfigurationBackupArchive>(await fixture.request("/management/settings/backup"));
    expect(archive.configuration.overlayOutputs).toHaveLength(8);
    archive.manifest.schemaVersion = 45;
    archive.configuration.overlayOutputs.push({ overlayId: "default", moduleId: "timers", targetProfileId: null, purpose: "live", scope: "module" }, { overlayId: "default", moduleId: "music", targetProfileId: "landscape", purpose: "test", scope: "module" }, { overlayId: "default", moduleId: null, targetProfileId: null, purpose: "live", scope: "unified" });
    archive.configuration.tables.overlay_surfaces!.push({ id: retiredSurface.id, kind: retiredSurface.kind, configuration_json: JSON.stringify(retiredSurface), updated_at: "2026-10-11T00:00:00Z" });
    archive.manifest.configurationRecordCount += 1;
    archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
    for (let repetition = 0; repetition < 2; repetition++) {
      const preflight = await checkedJson<ConfigurationRestorePreflight>(await fixture.request("/management/settings/backup/preflight", "POST", archive));
      expect(preflight.state, JSON.stringify(preflight.blockers)).toBe("valid"); expect(preflight.warnings.some(warning => /retired/iu.test(warning.summary))).toBe(true);
      const restored = await fixture.request("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
      expect(restored.status, await restored.clone().text()).toBe(200);
      const result = await restored.json() as ConfigurationRestoreResult; expect(result.regeneratedOutputs).toHaveLength(8);
      await fixture.stop(); await fixture.start();
      const exported = await checkedJson<ConfigurationBackupArchive>(await fixture.request("/management/settings/backup"));
      expect(exported.configuration.overlayOutputs).toHaveLength(8);
      expect(exported.configuration.tables.overlay_surfaces?.some(row => row.kind === "unified-browser")).toBe(false);
      expect(fixture.runtime.composition.database.connection.prepare("SELECT COUNT(*) n FROM overlay_keys WHERE revoked_at IS NULL").get()?.n).toBe(8);
      expect((await fetch(childUrl(result.regeneratedOutputs[0]!.url, "/composition"))).status).toBe(200);
      expect((await fetch(childUrl(legacyUrl, "/composition"))).status).toBe(401);
    }
  } finally { await fixture.close(); }
});

test("failed restore retires connected and racing recipients, then fresh restored ordinary credentials work", async () => {
  const fixture = await createProviderSecurityRuntimeFixture();
  const replace = SqliteConfigurationSnapshotRepository.prototype.replace;
  let release = () => {};
  let resetVerify = () => {};
  let racing: ReturnType<typeof connect> | undefined;
  try {
    await fixture.start();
    await checkedJson(await fixture.request("/management/alert-sets"));
    const key = await (await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: "vertical" })).json() as { url: string };
    const connected = await connect(key.url); expect(connected.first.type).toBe("overlay.connected");
    const access = fixture.runtime.composition.overlayAccessService;
    const verify = access.verifyRouteAccess.bind(access);
    const delayed = new Promise<void>(resolve => { release = resolve; });
    resetVerify = () => { access.verifyRouteAccess = verify; };
    let entered!: () => void;
    const entering = new Promise<void>(resolve => { entered = resolve; });
    access.verifyRouteAccess = async request => { const result = await verify(request); entered(); await delayed; return result; };
    racing = connect(key.url); void racing.catch(() => {}); await entering;
    const archive = await checkedJson<ConfigurationBackupArchive>(await fixture.request("/management/settings/backup"));
    const preflight = await checkedJson<ConfigurationRestorePreflight>(await fixture.request("/management/settings/backup/preflight", "POST", archive));
    expect(preflight.state).toBe("valid");
    SqliteConfigurationSnapshotRepository.prototype.replace = function (input) { replace.call(this, input); throw new Error("Injected replacement failure"); };
    const response = await fixture.request("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
    expect(response.status, await response.clone().text()).toBe(409); expect(await connected.closed).toBe(1008);
    release(); access.verifyRouteAccess = verify;
    const stale = await racing; expect(await stale.closed).toBe(1008); expect(stale.first.type).toBe("overlay.error");
    expect((await fetch(childUrl(key.url, "/composition"))).status).toBe(200);
    const fresh = await connect(key.url); expect(fresh.first.type).toBe("overlay.connected"); fresh.socket.close();
  } finally {
    release(); resetVerify(); SqliteConfigurationSnapshotRepository.prototype.replace = replace;
    await fixture.close(); await racing?.then(client => client.socket.terminate(), () => {});
  }
});

test("revoking one key preserves unrelated connected and in-flight ordinary recipients", async () => {
  const fixture = await createProviderSecurityRuntimeFixture();
  let release = () => {};
  let resetVerify = () => {};
  const races: ReturnType<typeof connect>[] = [];
  try {
    await fixture.start();
    const keys = await Promise.all(["landscape", "vertical"].map(async targetProfileId => checkedJson<{ keyId: string; url: string }>(
      await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId })
    )));
    const revoked = await connect(keys[0]!.url); const unrelated = await connect(keys[1]!.url);
    expect(revoked.first.type).toBe("overlay.connected"); expect(unrelated.first.type).toBe("overlay.connected");
    const access = fixture.runtime.composition.overlayAccessService;
    const verify = access.verifyRouteAccess.bind(access);
    const delayed = new Promise<void>(resolve => { release = resolve; });
    resetVerify = () => { access.verifyRouteAccess = verify; };
    let entered!: () => void; let registrations = 0;
    const entering = new Promise<void>(resolve => { entered = resolve; });
    access.verifyRouteAccess = async request => { const result = await verify(request); if (++registrations === 2) entered(); await delayed; return result; };
    for (const key of keys) { const race = connect(key.url); void race.catch(() => {}); races.push(race); }
    await entering;
    const response = await fixture.request(`/management/overlay-outputs/keys/${encodeURIComponent(keys[0]!.keyId)}`, "DELETE");
    expect(response.status, await response.clone().text()).toBe(204); expect(await revoked.closed).toBe(1008);
    expect(unrelated.socket.readyState).toBe(1);
    release(); resetVerify();
    const [retiredRace, ordinaryRace] = await Promise.all(races);
    expect(retiredRace!.first.type).toBe("overlay.error"); expect(await retiredRace!.closed).toBe(1008);
    expect(ordinaryRace!.first.type).toBe("overlay.connected"); expect(ordinaryRace!.socket.readyState).toBe(1);
    expect((await fetch(childUrl(keys[1]!.url, "/composition"))).status).toBe(200);
    unrelated.socket.close(); ordinaryRace!.socket.close();
  } finally {
    release(); resetVerify(); await fixture.close();
    await Promise.all(races.map(race => race.then(client => client.socket.terminate(), () => {})));
  }
});
