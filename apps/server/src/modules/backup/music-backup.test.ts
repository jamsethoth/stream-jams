import { createHash } from "node:crypto";
import {
  createDefaultMusicModuleConfig,
  musicModuleConfigSchema,
  type AppConfig,
  type AssetRecord,
  type ConfigurationBackupArchive,
  type SecretRef
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase, currentSchemaVersion, type StreamJamsDatabase } from "../db/database.js";
import { ConfigurationBackupService, ConfigurationRestoreBlockedError, type ConfigurationBackupServiceOptions } from "./configuration-backup-service.js";
import { SqliteConfigurationSnapshotRepository } from "./sqlite-configuration-snapshot-repository.js";

const appConfig: AppConfig = {
  desktop: { closeToTray: true, gpuAcceleration: true }, server: { host: "127.0.0.1", port: 39187 },
  storage: { dataDirectory: "C:/test/data", assetDirectory: "C:/test/assets" },
  logging: { level: "INFO", rollover: "hourly", retentionHours: 336 },
  playback: { paused: false, muted: false, doNotDisturb: false }
};
const stamp = "2026-10-04T12:00:00.000Z";
const bytes = Buffer.from("portable music asset");
const checksum = (value: Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const tokenRef: SecretRef = { namespace: "music", accountId: "pear-one", name: "access-token-123456" };

function fixture() {
  const config = createDefaultMusicModuleConfig();
  config.desktopPlacement = { full: { x: 123, y: 234 }, compact: { x: 12, y: 34 } };
  const assets: AssetRecord[] = [];
  for (const profile of ["landscape", "vertical"] as const) {
    for (const view of ["full", "compact"] as const) {
      const id = `brand-${profile}-${view}`;
      config.profiles[profile].views[view].branding.assetId = id;
      config.profiles[profile].views[view].componentLayout = {
        artwork: { x: 0, y: 0, width: 20, height: 20 },
        title: { x: 25, y: 0, width: 100, height: 25 },
        details: { x: 25, y: 30, width: 100, height: 20 },
        progress: { x: 25, y: 55, width: 100, height: 4 },
        time: { x: 25, y: 65, width: 100, height: 15 }
      };
      assets.push(record(id, "image", "image/png"));
    }
  }
  config.profiles.landscape.views.full.titleFont.fontAssetId = "font-title";
  config.profiles.vertical.views.compact.detailsFont.fontAssetId = "font-details";
  assets.push(record("font-title", "font", "font/woff2"), record("font-details", "font", "font/woff2"));
  config.css = { source: ".sj-title { color: red }", enabled: true, styleContractVersion: 1 };
  return { config, assets };
}

function record(id: string, mediaType: "image" | "font", mimeType: string): AssetRecord {
  return { id, originalFileName: `${id}.${mediaType === "image" ? "png" : "woff2"}`, mediaType,
    mimeType, sizeBytes: bytes.length, checksum: checksum(bytes), storagePath: `source/${id}`, durationMs: null };
}

function seed(database: StreamJamsDatabase, withMusic = true) {
  database.connection.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES ('default', 'Default', 1)").run();
  if (!withMusic) return [];
  const { config, assets } = fixture();
  database.connection.prepare("INSERT INTO overlay_module_config (module_id, enabled, config_json, updated_at) VALUES (?, ?, ?, ?)")
    .run("music", 1, JSON.stringify(config), stamp);
  for (const asset of assets) database.connection.prepare(
    "INSERT INTO asset_metadata (id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"
  ).run(asset.id, asset.originalFileName, asset.mediaType, asset.mimeType, asset.sizeBytes, asset.checksum, asset.storagePath);
  database.connection.prepare(`INSERT INTO provider_registrations
    (id, name, kind, capability, non_secret_config_json, secret_ref_json, active, connection_state, intake_state,
     validated_at, error_json, available_voices_json, tts_safety_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "pear-one", "Pear", "pear-desktop", "music-source",
      JSON.stringify({ baseUrl: "http://127.0.0.1:26538", transport: "auto" }), JSON.stringify(tokenRef),
      1, "connected", null, stamp, null, "[]", null, stamp, stamp
    );
  return assets;
}

function harness(options: { readonly withMusic?: boolean; readonly fail?: "asset" | "swap" | "startup" | "cleanup" } = {}) {
  const database = createInMemoryStreamJamsDatabase();
  let assets = seed(database, options.withMusic ?? true);
  let identity: string | null = "old-client-id";
  let runtime = "running";
  let failStartupOnce = true;
  const calls: string[] = [];
  const deleteOldSecret = vi.fn(async (_ref: SecretRef) => {
    void _ref;
    if (options.fail === "cleanup") throw new Error("keyring unavailable");
  });
  const repository = new SqliteConfigurationSnapshotRepository(database.connection);
  const service = new ConfigurationBackupService({
    appVersion: "test", schemaVersion: currentSchemaVersion, now: () => new Date(stamp), generateReferenceId: () => "ref-music",
    configStore: { readConfig: async () => appConfig, updateConfig: async () => appConfig },
    snapshotRepository: {
      snapshot: () => repository.snapshot(), captureRestorePoint: () => repository.captureRestorePoint(),
      restoreRestorePoint: point => repository.restoreRestorePoint(point), validate: config => repository.validate(config),
      replace: input => {
        if (options.fail === "swap") throw new Error("database swap failed");
        repository.replace(input);
        assets = [...input.assets];
      }
    },
    assetRepository: { list: async () => assets },
    assetStore: {
      read: async () => bytes,
      write: async input => {
        if (options.fail === "asset") throw new Error("asset staging failed");
        return { storagePath: `restored/${input.assetId}` };
      },
      delete: async () => undefined
    },
    assetValidator: { validate: input => ({ accepted: true, reason: null, mediaType: input.mimeType.startsWith("font/") ? "font" : "image", normalizedExtension: input.mimeType.startsWith("font/") ? ".woff2" : ".png" }) },
    getRuntime: async () => ({ intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 }),
    getAvailableBytes: async () => 1_000_000,
    safetyBackupStore: { write: async () => "C:/test/safety.streamjams-backup" },
    regenerateOutput: async output => ({ label: output.overlayId, url: "http://127.0.0.1:39187/test" }),
    musicRestore: {
      async captureCredentials() { return { identity, secretRefs: options.withMusic === false ? [] : [tokenRef] }; },
      async suspend() { calls.push("suspend"); runtime = "stopped"; },
      async resume() {
        calls.push("resume");
        if (options.fail === "startup" && failStartupOnce) { failStartupOnce = false; throw new Error("Music startup failed"); }
        runtime = "running";
      },
      async rotateIdentity() { calls.push("rotate"); identity = "fresh-client-id"; },
      async restoreIdentity(previous) { calls.push("restore-identity"); identity = previous; },
      deleteOldSecret
    }
  } satisfies ConfigurationBackupServiceOptions);
  return { service, database, calls, deleteOldSecret, get identity() { return identity; }, get runtime() { return runtime; } };
}

function reseal(archive: ConfigurationBackupArchive): ConfigurationBackupArchive {
  archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
  return archive;
}

describe("Music portable backup and restore", () => {
  it("round-trips four brands, both fonts, CSS and nonsecret Pear settings while requiring fresh pairing", async () => {
    const source = harness(); const target = harness({ withMusic: false });
    try {
      const archive = await source.service.exportArchive();
      expect(JSON.stringify(archive)).not.toMatch(/old-client-id|access-token-123456|secret_ref|artworkRef|nowPlaying/);
      expect(archive.configuration.tables.provider_registrations?.[0]?.non_secret_config_json).toContain("127.0.0.1:26538");
      expect(archive.assets).toHaveLength(6);
      const preflight = await target.service.preflight(archive);
      expect(preflight.state).toBe("valid");
      const result = await target.service.restore({ archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true });
      expect(result.state).toBe("completed");
      expect(target.identity).toBe("fresh-client-id");
      const restored = target.database.connection.prepare("SELECT enabled, config_json FROM overlay_module_config WHERE module_id = 'music'").get()!;
      expect(JSON.parse(String(restored.config_json))).toEqual(fixture().config);
      expect(target.database.connection.prepare("SELECT secret_ref_json FROM provider_registrations WHERE id = 'pear-one'").get()?.secret_ref_json).toBeNull();
      expect(target.calls).toEqual(["suspend", "rotate", "resume"]);
    } finally { source.database.close(); target.database.close(); }
  });

  it("rejects invalid CSS and every missing or wrong-type Music asset before mutation", async () => {
    const source = harness(); const target = harness({ withMusic: false });
    try {
      const original = await source.service.exportArchive();
      for (const modify of [
        (archive: ConfigurationBackupArchive) => { const row = archive.configuration.tables.overlay_module_config![0]!; const config = JSON.parse(String(row.config_json)); config.css.source = ".sj-title { background: url(https://bad.example/x) }"; row.config_json = JSON.stringify(config); },
        (archive: ConfigurationBackupArchive) => { archive.configuration.tables.asset_metadata = archive.configuration.tables.asset_metadata!.filter(row => row.id !== "brand-vertical-compact"); archive.assets = archive.assets.filter(asset => asset.id !== "brand-vertical-compact"); archive.manifest.assetCount -= 1; archive.manifest.totalAssetBytes -= bytes.length; archive.manifest.configurationRecordCount -= 1; },
        (archive: ConfigurationBackupArchive) => { const row = archive.configuration.tables.overlay_module_config![0]!; const config = JSON.parse(String(row.config_json)); config.profiles.landscape.views.full.titleFont.fontAssetId = "brand-landscape-full"; row.config_json = JSON.stringify(config); }
      ]) {
        const archive = structuredClone(original);
        modify(archive); reseal(archive);
        const result = await target.service.preflight(archive);
        expect(result.state).toBe("invalid");
        expect(result.blockers.some(item => /Music|asset/i.test(item.cause ?? ""))).toBe(true);
        expect(target.calls).toEqual([]);
      }
    } finally { source.database.close(); target.database.close(); }
  });

  it("restores an archive without Music as disabled defaults", async () => {
    const source = harness({ withMusic: false }); const target = harness();
    try {
      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);
      expect(preflight.state).toBe("valid");
      await target.service.restore({ archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true });
      expect(target.database.connection.prepare("SELECT * FROM overlay_module_config WHERE module_id = 'music'").get()).toBeUndefined();
    } finally { source.database.close(); target.database.close(); }
  });

  it("defaults supported older appearance fields and rejects an unsupported schema", async () => {
    const source = harness(); const target = harness({ withMusic: false });
    try {
      const archive = await source.service.exportArchive();
      const row = archive.configuration.tables.overlay_module_config![0]!;
      const config = JSON.parse(String(row.config_json));
      delete config.css;
      for (const profile of ["landscape", "vertical"]) for (const view of ["full", "compact"]) {
        delete config.profiles[profile].views[view].branding;
      }
      row.config_json = JSON.stringify(config);
      reseal(archive);
      const preflight = await target.service.preflight(archive);
      expect(preflight.state).toBe("valid");
      await target.service.restore({ archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true });
      const stored = target.database.connection.prepare("SELECT config_json FROM overlay_module_config WHERE module_id = 'music'").get()!;
      const normalized = musicModuleConfigSchema.parse(JSON.parse(String(stored.config_json)));
      expect(normalized.css).toEqual({ source: "", enabled: false, styleContractVersion: 1 });
      expect(normalized.profiles.vertical.views.compact.branding.assetId).toBeNull();
      const unsupported = structuredClone(archive);
      unsupported.manifest.schemaVersion = currentSchemaVersion + 100;
      expect((await target.service.preflight(unsupported)).state).toBe("invalid");
    } finally { source.database.close(); target.database.close(); }
  });

  it.each(["asset", "swap", "startup"] as const)("rolls back %s failures without retiring credentials", async fail => {
    const source = harness(); const target = harness({ fail });
    try {
      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);
      await expect(target.service.restore({ archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true }))
        .rejects.toBeInstanceOf(ConfigurationRestoreBlockedError);
      expect(target.identity).toBe("old-client-id");
      expect(target.runtime).toBe("running");
      expect(target.database.connection.prepare("SELECT secret_ref_json FROM provider_registrations WHERE id = 'pear-one'").get()?.secret_ref_json).toBe(JSON.stringify(tokenRef));
      expect(target.deleteOldSecret).not.toHaveBeenCalled();
      if (fail !== "asset") expect(target.calls[0]).toBe("suspend");
    } finally { source.database.close(); target.database.close(); }
  });

  it("reports keyring cleanup failure after a committed restore", async () => {
    const source = harness(); const target = harness({ fail: "cleanup" });
    try {
      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);
      const result = await target.service.restore({ archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true });
      expect(result.state).toBe("completed");
      expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ summary: "Old Music credentials could not be removed" })]));
      expect(target.identity).toBe("fresh-client-id");
    } finally { source.database.close(); target.database.close(); }
  });
});
