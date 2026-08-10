export const alertTextStyleDefaultsMigration = {
  id: "017-alert-text-style-defaults",
  sql: `
UPDATE alert_editor_documents
SET document_json = json_set(
  document_json,
  '$.layers',
  json((
    SELECT json_group_array(json(
      CASE
        WHEN json_extract(layer.value, '$.type') = 'text'
          THEN json_insert(
            layer.value,
            '$.textStyle', json('{"fontPreset":"system-sans","fontSizePx":32,"fontWeight":800,"lineHeight":1.15,"horizontalAlign":"center","verticalAlign":"center","color":"#FFFFFFFF","shadow":{"offsetX":0,"offsetY":2,"blur":8,"color":"#000000B8"}}'),
            '$.boxStyle', json('{"backgroundColor":"#00000000","paddingPx":0,"cornerRadiusPx":0,"shadow":null}')
          )
        ELSE layer.value
      END
    ))
    FROM json_each(document_json, '$.layers') AS layer
  ))
);
`
} as const;
