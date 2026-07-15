export const alertEditorDocumentsMigration = {
  id: "009-alert-editor-documents",
  sql: `
CREATE TABLE alert_editor_documents (
  alert_id TEXT PRIMARY KEY NOT NULL,
  document_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (alert_id) REFERENCES alert_rules(id) ON DELETE CASCADE
);
`
} as const;
