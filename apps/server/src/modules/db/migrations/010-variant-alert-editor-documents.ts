export const variantAlertEditorDocumentsMigration = {
  id: "010-variant-alert-editor-documents",
  sql: `
CREATE TABLE alert_editor_documents_next (
  alert_id TEXT PRIMARY KEY NOT NULL,
  document_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO alert_editor_documents_next (alert_id, document_json, updated_at)
SELECT alert_id, document_json, updated_at
FROM alert_editor_documents;

DROP TABLE alert_editor_documents;
ALTER TABLE alert_editor_documents_next RENAME TO alert_editor_documents;

CREATE TRIGGER alert_editor_documents_validate_owner_insert
BEFORE INSERT ON alert_editor_documents
WHEN NOT EXISTS (SELECT 1 FROM alert_rules WHERE id = NEW.alert_id)
 AND NOT EXISTS (SELECT 1 FROM alert_variants WHERE id = NEW.alert_id)
BEGIN
  SELECT RAISE(ABORT, 'alert editor document owner must be an alert rule or alert variant');
END;

CREATE TRIGGER alert_editor_documents_validate_owner_update
BEFORE UPDATE OF alert_id ON alert_editor_documents
WHEN NOT EXISTS (SELECT 1 FROM alert_rules WHERE id = NEW.alert_id)
 AND NOT EXISTS (SELECT 1 FROM alert_variants WHERE id = NEW.alert_id)
BEGIN
  SELECT RAISE(ABORT, 'alert editor document owner must be an alert rule or alert variant');
END;

CREATE TRIGGER alert_editor_documents_delete_rule
AFTER DELETE ON alert_rules
BEGIN
  DELETE FROM alert_editor_documents WHERE alert_id = OLD.id;
END;

CREATE TRIGGER alert_editor_documents_delete_variant
AFTER DELETE ON alert_variants
BEGIN
  DELETE FROM alert_editor_documents WHERE alert_id = OLD.id;
END;
`
} as const;
