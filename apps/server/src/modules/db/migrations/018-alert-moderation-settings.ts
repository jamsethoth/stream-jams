export const alertModerationSettingsMigration = {
  id: "018-alert-moderation-settings",
  sql: `
CREATE TABLE alert_moderation_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  rendered_max_length INTEGER NOT NULL CHECK (rendered_max_length BETWEEN 1 AND 10000),
  rendered_blocked_terms_json TEXT NOT NULL,
  rendered_strip_urls INTEGER NOT NULL CHECK (rendered_strip_urls IN (0, 1)),
  tts_max_length INTEGER NOT NULL CHECK (tts_max_length BETWEEN 1 AND 10000),
  tts_blocked_terms_json TEXT NOT NULL,
  tts_strip_urls INTEGER NOT NULL CHECK (tts_strip_urls IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO alert_moderation_settings (
  id,
  rendered_max_length,
  rendered_blocked_terms_json,
  rendered_strip_urls,
  tts_max_length,
  tts_blocked_terms_json,
  tts_strip_urls,
  updated_at
) VALUES (1, 240, '[]', 0, 180, '[]', 1, CURRENT_TIMESTAMP);
`
} as const;
