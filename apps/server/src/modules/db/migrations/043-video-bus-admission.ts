/** Admission receipts are runtime data, excluded from saved-configuration exports. */
export const videoBusAdmissionMigration = {
  id: "043-video-bus-admission",
  sql: `
CREATE TABLE video_bus_admissions (
  bus_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  item_id TEXT,
  result_json TEXT NOT NULL,
  admitted_at_ms INTEGER NOT NULL
);
CREATE INDEX video_bus_admissions_cleanup ON video_bus_admissions(admitted_at_ms, bus_id);
`
};
