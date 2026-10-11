import type { StreamJamsMigration } from "../database.js";
export const dataOverlayTemplatesMigration: StreamJamsMigration = {
  id: "043-data-overlay-templates",
  // Templates intentionally retain unresolved asset identities without preventing library removal.
  sql: "CREATE TABLE data_templates (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, document TEXT NOT NULL);"
};
