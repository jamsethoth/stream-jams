/** Provider-reported title and channel for queued videos, filled in after the request is queued. */
export const videoRequestMetadataMigration = {
  id: "041-video-request-metadata",
  sql: `
ALTER TABLE video_requests ADD COLUMN provider_title TEXT;
ALTER TABLE video_requests ADD COLUMN channel_name TEXT;
`
} as const;
