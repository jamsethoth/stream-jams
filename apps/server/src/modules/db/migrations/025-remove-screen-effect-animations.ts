export const removeScreenEffectAnimationsMigration = {
  id: "025-remove-screen-effect-animations",
  sql: `
UPDATE screen_effect_variants
SET document_json = json_remove(document_json, '$.animation')
WHERE json_type(document_json, '$.animation') IS NOT NULL;
`
} as const;
