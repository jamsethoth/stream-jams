export const alertVideoAudioMigration = {
  id: "021-alert-video-audio",
  sql: `
UPDATE alert_editor_documents
SET document_json = json_set(document_json,
  '$.schemaVersion', 1,
  '$.layers', json((
    SELECT json_group_array(json(layer))
    FROM (
      SELECT CASE WHEN json_extract(value, '$.type') = 'video'
        THEN json_insert(value, '$.playEmbeddedAudio', json('false'), '$.audioVolume', 1)
        ELSE value END AS layer
      FROM json_each(alert_editor_documents.document_json, '$.layers')
      ORDER BY CAST(key AS INTEGER)
    )
  ))
)
WHERE json_type(document_json, '$.schemaVersion') IS NULL;
`
} as const;
