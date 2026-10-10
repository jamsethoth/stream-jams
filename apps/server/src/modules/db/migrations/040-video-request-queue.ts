export const videoRequestQueueMigration = {
  id: "040-video-request-queue",
  sql: `
CREATE TABLE video_requests (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('live', 'test')),
  source_json TEXT NOT NULL,
  title TEXT,
  requester TEXT,
  submitted_via TEXT NOT NULL CHECK (submitted_via IN ('management', 'operator', 'automation', 'streamerbot', 'channel-points')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'held', 'playing', 'paused', 'played', 'failed', 'removed')),
  hold_reason TEXT CHECK (hold_reason IS NULL OR hold_reason IN ('over-limit', 'unknown-length')),
  limit_overridden INTEGER NOT NULL CHECK (limit_overridden IN (0, 1)),
  autoplay INTEGER NOT NULL CHECK (autoplay IN (0, 1)),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'held') = (hold_reason IS NOT NULL))
);

CREATE INDEX video_requests_purpose_status_position ON video_requests (purpose, status, position);

CREATE TABLE video_queue_state (
  purpose TEXT PRIMARY KEY NOT NULL CHECK (purpose IN ('live', 'test')),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  queue_paused INTEGER NOT NULL CHECK (queue_paused IN (0, 1)),
  run_json TEXT
);

INSERT INTO video_queue_state (purpose, revision, queue_paused, run_json) VALUES ('live', 0, 0, NULL), ('test', 0, 0, NULL);

UPDATE overlay_keys SET revoked_at = COALESCE(revoked_at, created_at) WHERE module_id = 'video-shoutout';
DELETE FROM overlay_module_config WHERE module_id = 'video-shoutout';
`
} as const;
