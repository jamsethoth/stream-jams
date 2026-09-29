export const timerOverlayModuleMigration = {
  id: "028-timer-overlay-module",
  sql: `
CREATE TABLE timer_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL CHECK(length(trim(label)) > 0),
  duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
  icon_asset_id TEXT,
  start_audio_asset_id TEXT,
  end_audio_asset_id TEXT,
  browser_source INTEGER NOT NULL CHECK(browser_source IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (icon_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  FOREIGN KEY (start_audio_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  FOREIGN KEY (end_audio_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT
);

CREATE INDEX timer_definitions_label_order
ON timer_definitions(label COLLATE NOCASE, id);

CREATE TABLE timer_audio_routes (
  timer_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  PRIMARY KEY (timer_id, route_id),
  UNIQUE (timer_id, position),
  FOREIGN KEY (timer_id) REFERENCES timer_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES audio_output_routes(id) ON DELETE RESTRICT
);

CREATE INDEX timer_audio_routes_route_id
ON timer_audio_routes(route_id, timer_id);

CREATE TABLE timer_automation_credential (
  singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1),
  verifier TEXT NOT NULL CHECK(length(verifier) >= 20),
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT
);
`
} as const;
