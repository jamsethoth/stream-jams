export const diagnosticOrderIndexesMigration = {
  id: "014-diagnostic-order-indexes",
  sql: `
DROP INDEX event_logs_received_at_idx;
CREATE INDEX event_logs_received_order_idx ON event_logs(received_at, id);

DROP INDEX alert_match_logs_matched_at_idx;
CREATE INDEX alert_match_logs_matched_order_idx ON alert_match_logs(matched_at, id);

DROP INDEX playback_logs_occurred_at_idx;
CREATE INDEX playback_logs_occurred_order_idx ON playback_logs(occurred_at, id);
`
} as const;
