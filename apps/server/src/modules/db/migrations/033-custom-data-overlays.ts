import type { StreamJamsMigration } from "../database.js";
export const customDataOverlaysMigration: StreamJamsMigration = {
  id: "033-custom-data-overlays",
  sql: `
    CREATE TABLE data_overlay_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0));
    INSERT INTO data_overlay_meta VALUES (1,0);
    CREATE TABLE data_reset_groups (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, document TEXT NOT NULL);
    CREATE TABLE data_values (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, reset_group_id TEXT REFERENCES data_reset_groups(id), document TEXT NOT NULL);
    CREATE TABLE data_goals (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, value_id TEXT NOT NULL REFERENCES data_values(id), document TEXT NOT NULL);
    CREATE TABLE data_canvases (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, document TEXT NOT NULL);
    CREATE TABLE data_pins (value_id TEXT PRIMARY KEY REFERENCES data_values(id), position INTEGER NOT NULL UNIQUE);
    CREATE TABLE data_element_refs (canvas_id TEXT NOT NULL REFERENCES data_canvases(id), element_id TEXT NOT NULL, value_id TEXT REFERENCES data_values(id), goal_id TEXT REFERENCES data_goals(id), asset_id TEXT REFERENCES asset_metadata(id), PRIMARY KEY(canvas_id,element_id));
  `
};
