import { upgradeVideosLayout, videosModuleConfigSchema } from "@stream-jams/core";
import type { StreamJamsMigration } from "../database.js";

export const videoContentLayoutMigration: StreamJamsMigration = {
  id: "045-video-content-layout",
  sql: "-- Video content and placement are upgraded by the shared typed boundary.",
  apply(connection) {
    const row = connection.prepare("SELECT config_json FROM overlay_module_config WHERE module_id = 'videos'").get();
    if (row === undefined) return;
    const raw = JSON.parse(String(row.config_json)) as Record<string, unknown>;
    const config = videosModuleConfigSchema.parse({ ...raw, layout: upgradeVideosLayout(raw.layout) });
    connection.prepare("UPDATE overlay_module_config SET config_json = ? WHERE module_id = 'videos'").run(JSON.stringify(config));
  }
};
