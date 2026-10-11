import { currentVideosModuleConfigSchema, videosModuleConfigSchema } from "@stream-jams/core";
import { upgradeVideoAdmissionResult } from "@stream-jams/core/videos";
import type { StreamJamsMigration } from "../database.js";

export const singleVideoQueueMigration: StreamJamsMigration = {
  id: "046-single-video-queue",
  sql: "-- Validated single-queue cutover runs transactionally below.",
  apply(db) {
    const count = Number(db.prepare("SELECT COUNT(*) n FROM video_requests WHERE status IN ('queued','held','playing','paused')").get()?.n);
    if (count > 500) throw new Error(`Videos upgrade needs review: ${count} active/waiting requests exceed capacity 500. Open the previous app, remove requests, and retry with the retained backup.`);
    const rows = db.prepare("SELECT * FROM video_requests ORDER BY position, created_at, id").all();
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Videos upgrade found duplicate identities. Repair the source database before retrying; no requests were changed.");
    const configRow = db.prepare("SELECT config_json FROM overlay_module_config WHERE module_id='videos'").get();
    let upgradedConfig: string | null = null;
    if (configRow !== undefined) {
      const raw = JSON.parse(String(configRow.config_json)) as Record<string, unknown>;
      const current = currentVideosModuleConfigSchema.safeParse(raw);
      const legacy = current.success ? null : videosModuleConfigSchema.parse(raw);
      upgradedConfig = JSON.stringify(current.success ? current.data : currentVideosModuleConfigSchema.parse({ ...legacy, rewardMappings: legacy!.rewardMappings.map(({ rewardId }) => ({ rewardId })) }));
    }
    const receipts = db.prepare("SELECT bus_id,result_json FROM video_bus_admissions").all().map(row => {
      if (Buffer.byteLength(String(row.result_json), "utf8") > 16384) throw new Error("Videos upgrade found an oversized admission receipt. Repair the source database before retrying.");
      return { id: String(row.bus_id), json: JSON.stringify(upgradeVideoAdmissionResult(JSON.parse(String(row.result_json)))) };
    });
    db.exec(`CREATE TABLE video_requests_single (
      id TEXT PRIMARY KEY NOT NULL, purpose TEXT NOT NULL CHECK(purpose='live'), source_json TEXT NOT NULL,
      title TEXT,requester TEXT,submitted_via TEXT NOT NULL CHECK(submitted_via IN ('management','operator','automation','streamerbot','channel-points')),
      duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms>0),status TEXT NOT NULL CHECK(status IN ('queued','held','playing','paused','played','failed','removed')),
      hold_reason TEXT CHECK(hold_reason IS NULL OR hold_reason IN ('over-limit','unknown-length')),
      limit_overridden INTEGER NOT NULL CHECK(limit_overridden IN(0,1)),autoplay INTEGER NOT NULL CHECK(autoplay IN(0,1)),
      position INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,provider_title TEXT,channel_name TEXT,
      review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN(0,1)),migration_provenance_json TEXT,
      CHECK((status='held')=(review_required=1 OR hold_reason IS NOT NULL))
    )`);
    let position = Math.max(0, ...rows.filter(row => row.purpose === "live").map(row => Number(row.position))) + 1;
    const insert = db.prepare(`INSERT INTO video_requests_single VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const row of rows) {
      const migrated = row.purpose === "test";
      const actionable = migrated && ["queued","held","playing","paused"].includes(String(row.status));
      insert.run(row.id!, "live", row.source_json!, row.title!, row.requester!, row.submitted_via!, row.duration_ms!,
        actionable ? "held" : row.status!, row.hold_reason!, row.limit_overridden!, actionable ? 0 : row.autoplay!,
        actionable ? position++ : row.position!, row.created_at!, row.updated_at!, row.provider_title!, row.channel_name!,
        actionable ? 1 : 0, migrated ? JSON.stringify({ kind:"test-queue-consolidation",originalPurpose:"test",originalStatus:row.status }) : null);
    }
    db.exec(`DROP TABLE video_requests; ALTER TABLE video_requests_single RENAME TO video_requests;
      CREATE INDEX video_requests_purpose_status_position ON video_requests(purpose,status,position);
      UPDATE video_queue_state SET revision=(SELECT MAX(revision)+1 FROM video_queue_state),run_json=NULL WHERE purpose='live';
      DELETE FROM video_queue_state WHERE purpose='test';
      UPDATE overlay_keys SET revoked_at=COALESCE(revoked_at,created_at) WHERE module_id='videos' AND purpose='test';`);
    if (upgradedConfig !== null) db.prepare("UPDATE overlay_module_config SET config_json=? WHERE module_id='videos'").run(upgradedConfig);
    for (const receipt of receipts) db.prepare("UPDATE video_bus_admissions SET result_json=? WHERE bus_id=?").run(receipt.json,receipt.id);
  }
};
