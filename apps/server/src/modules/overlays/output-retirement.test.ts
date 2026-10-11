import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDefaultOverlayModuleRegistry, type SecretRef } from "@stream-jams/core";
import { createPreMigrationDatabase } from "../../test-support/pre-migration-database.js";
import { cleanupRetiredOutputSecrets } from "./retired-output-secrets.js";
import { SqliteOverlayAccessKeyRepository } from "./sqlite-overlay-access-key-repository.js";
import { LocalOverlayAccessService } from "./overlay-access-service.js";
import { SqliteSurfaceRepository } from "../overlay-surfaces/sqlite-surface-repository.js";

describe("public output retirement", () => {
  it("revokes all old public lanes while preserving exact ordinary identities and local desktop choices through repeated migration", async () => {
    using fixture = createPreMigrationDatabase("047-retire-public-overlays");
    let db = fixture.connection;
    const desktop = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "chosen", displayLabel: "Chosen display", autoFollowDisplayName: true, opacity: .6, layers: [{ moduleId: "timers", visible: true }, { moduleId: "music", visible: false }] };
    db.prepare("UPDATE overlay_surfaces SET configuration_json=? WHERE id='desktop:primary'").run(JSON.stringify(desktop));
    db.prepare("INSERT INTO overlay_surfaces VALUES ('unified-browser:default','unified-browser',?, 'old')").run(JSON.stringify({ id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [] }));
    const seed = (id: string, module: string | null, purpose: string, scope: string, profile: string | null) => {
      db.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,target_profile_id,key_hash,route_key_secret_ref_json,created_at,revoked_at) VALUES (?,'default',?,?,?,?,?,?, 'old',NULL)")
        .run(id, module, purpose, scope, profile, `sha256:${createHash("sha256").update(id).digest("hex")}`, JSON.stringify({ namespace: "overlay", accountId: id, name: "route-key" }));
    };
    seed("ordinary", "music", "live", "module", "vertical");
    seed("legacy", "timers", "live", "module", null);
    seed("retired", "music", "test", "module", "landscape");
    seed("unified", null, "live", "unified", null);
    const ordinaryBefore = db.prepare("SELECT * FROM overlay_keys WHERE id='ordinary'").get();
    const upgraded = fixture.upgrade(); db = upgraded.connection; upgraded.runMigrations();
    expect(db.prepare("SELECT * FROM overlay_keys WHERE id='ordinary'").get()).toEqual(ordinaryBefore);
    expect(db.prepare("SELECT revoked_at FROM overlay_keys WHERE id='legacy'").get()?.revoked_at).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM overlay_keys WHERE (scope='unified' OR purpose='test') AND revoked_at IS NULL").get()?.n).toBe(0);
    const surfaces = new SqliteSurfaceRepository(db, createDefaultOverlayModuleRegistry());
    const saved = (await surfaces.list())[0]!;
    const { layers, ...desktopFields } = desktop;
    expect(saved).toMatchObject(desktopFields);
    expect(saved.layers.slice(0, layers.length)).toEqual(layers);
    await surfaces.list();
    expect(db.prepare("SELECT COUNT(*) n FROM overlay_surfaces WHERE kind='unified-browser'").get()?.n).toBe(0);
    const access = new LocalOverlayAccessService({ repository: new SqliteOverlayAccessKeyRepository(db) });
    expect((await access.verifyRouteAccess({ overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: null, rawKey: "legacy" })).authorized).toBe(true);
    expect((await access.verifyRouteAccess({ overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: "landscape", rawKey: "legacy" })).authorized).toBe(false);
  });

  it("cleanup failure never restores authority and retries validated revoked refs without touching active ordinary secrets", async () => {
    using fixture = createPreMigrationDatabase("047-retire-public-overlays");
    const db = fixture.connection;
    for (const [id, module, purpose, revoked] of [["retired-video", "videos", "test", "already-revoked"], ["revoked-legacy", "timers", "live", "revoked"], ["ordinary", "music", "live", null], ["bad-ref", "alerts", "test", null]] as const) {
      db.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,target_profile_id,key_hash,route_key_secret_ref_json,created_at,revoked_at) VALUES (?,'default',?,?,'module',NULL,?,?, 'old',?)")
        .run(id, module, purpose, id, JSON.stringify({ namespace: "overlay", accountId: id === "bad-ref" ? "ordinary" : id, name: "route-key" }), revoked);
    }
    const before = db.prepare("SELECT * FROM overlay_keys WHERE id='ordinary'").get();
    const fail = vi.fn(async () => { throw new Error("keyring unavailable"); });
    expect(await cleanupRetiredOutputSecrets(db, { deleteSecret: fail })).toBe(3);
    expect(db.prepare("SELECT revoked_at FROM overlay_keys WHERE id='bad-ref'").get()?.revoked_at).not.toBeNull();
    expect(fail.mock.calls).toHaveLength(2);
    expect(db.prepare("SELECT * FROM overlay_keys WHERE id='ordinary'").get()).toEqual(before);
    const succeed = vi.fn(async (ref: SecretRef) => { expect(ref.namespace).toBe("overlay"); });
    expect(await cleanupRetiredOutputSecrets(db, { deleteSecret: succeed })).toBe(1);
    expect(succeed.mock.calls.map(call => call[0])).toEqual([
      { namespace: "overlay", accountId: "retired-video", name: "route-key" },
      { namespace: "overlay", accountId: "revoked-legacy", name: "route-key" }
    ]);
    expect(await cleanupRetiredOutputSecrets(db, { deleteSecret: succeed })).toBe(1);
    expect(succeed).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT * FROM overlay_keys WHERE id='ordinary'").get()).toEqual(before);
  });
});
