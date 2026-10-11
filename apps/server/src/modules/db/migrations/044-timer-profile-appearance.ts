import { upgradeTimersConfig } from "@stream-jams/core";
import type { StreamJamsMigration } from "../database.js";

export const timerProfileAppearanceMigration: StreamJamsMigration = {
  id: "044-timer-profile-appearance",
  sql: "-- Timer profile appearance is upgraded by the shared typed configuration boundary.",
  apply(connection) {
    const row = connection.prepare("SELECT config_json FROM overlay_module_config WHERE module_id = 'timers'").get();
    if (row === undefined) return;
    const config = upgradeTimersConfig(JSON.parse(String(row.config_json)) as unknown);
    connection.prepare("UPDATE overlay_module_config SET config_json = ? WHERE module_id = 'timers'").run(JSON.stringify(config));
  }
};
