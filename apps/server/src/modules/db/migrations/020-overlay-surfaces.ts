export const overlaySurfacesMigration = {
  id: "020-overlay-surfaces",
  sql: `
CREATE TABLE overlay_surfaces (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('desktop', 'unified-browser')),
  configuration_json TEXT NOT NULL CHECK (json_valid(configuration_json)),
  updated_at TEXT NOT NULL,
  CHECK (json_extract(configuration_json, '$.id') IS id),
  CHECK (json_extract(configuration_json, '$.kind') IS kind)
);
INSERT INTO overlay_surfaces (id, kind, configuration_json, updated_at)
VALUES ('desktop:primary', 'desktop', '{"id":"desktop:primary","kind":"desktop","enabled":false,"displayId":null,"opacity":1,"layers":[]}', CURRENT_TIMESTAMP);
`
} as const;
