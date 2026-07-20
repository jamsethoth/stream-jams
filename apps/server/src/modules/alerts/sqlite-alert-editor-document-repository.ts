import type { DatabaseSync } from "node:sqlite";
import { alertEditorDocumentSchema, type AlertEditorDocument } from "@stream-jams/core";
import type { AlertEditorDocumentRepository } from "./alert-editor-service.js";

interface AlertEditorDocumentRow {
  readonly document_json: unknown;
}

export class SqliteAlertEditorDocumentRepository implements AlertEditorDocumentRepository {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;

  constructor(connection: DatabaseSync, now: () => Date = () => new Date()) {
    this.#connection = connection;
    this.#now = now;
  }

  async find(alertId: string): Promise<AlertEditorDocument | null> {
    const row = this.#connection
      .prepare("SELECT document_json FROM alert_editor_documents WHERE alert_id = ?")
      .get(alertId) as AlertEditorDocumentRow | undefined;
    if (row === undefined) return null;
    return alertEditorDocumentSchema.parse(JSON.parse(String(row.document_json)) as unknown);
  }

  async findMany(alertIds: readonly string[]): Promise<ReadonlyMap<string, AlertEditorDocument>> {
    const ids = Array.from(new Set(alertIds));
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.#connection
      .prepare(
        `SELECT alert_id, document_json
         FROM alert_editor_documents
         WHERE alert_id IN (${placeholders})`
      )
      .all(...ids);
    return new Map(rows.map((row) => [
      String(row.alert_id),
      alertEditorDocumentSchema.parse(JSON.parse(String(row.document_json)) as unknown)
    ]));
  }

  async save(candidate: AlertEditorDocument): Promise<AlertEditorDocument> {
    return this.saveSync(candidate);
  }

  async delete(editorId: string): Promise<void> {
    this.deleteSync(editorId);
  }

  deleteSync(editorId: string): void {
    this.#connection.prepare("DELETE FROM alert_editor_documents WHERE alert_id = ?").run(editorId);
  }

  saveSync(candidate: AlertEditorDocument): AlertEditorDocument {
    const document = alertEditorDocumentSchema.parse(candidate);
    this.#connection
      .prepare(
        `INSERT INTO alert_editor_documents (alert_id, document_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(alert_id) DO UPDATE SET
           document_json = excluded.document_json,
           updated_at = excluded.updated_at`
      )
      .run(document.id, JSON.stringify(document), this.#now().toISOString());
    return document;
  }
}
