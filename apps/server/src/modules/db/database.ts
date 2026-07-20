import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementResultingChanges } from "node:sqlite";
import { initialSchemaMigration } from "./migrations/001-initial-schema.js";
import { alertVariantSelectionMigration } from "./migrations/002-alert-variant-selection.js";
import { twitchAccountsMigration } from "./migrations/003-twitch-accounts.js";
import { overlayKeySecretRefMigration } from "./migrations/004-overlay-key-secret-ref.js";
import { providerRegistrationsMigration } from "./migrations/005-provider-registrations.js";
import { overlayKeyTargetProfileMigration } from "./migrations/006-overlay-key-target-profile.js";
import { alertSetManagementMigration } from "./migrations/007-alert-set-management.js";
import { assetLibraryMetadataMigration } from "./migrations/008-asset-library-metadata.js";
import { alertEditorDocumentsMigration } from "./migrations/009-alert-editor-documents.js";
import { variantAlertEditorDocumentsMigration } from "./migrations/010-variant-alert-editor-documents.js";
import { alertVariantOrderMigration } from "./migrations/011-alert-variant-order.js";
import { revokeUnsupportedOverlayKeysMigration } from "./migrations/012-revoke-unsupported-overlay-keys.js";
import { alertReadIndexesMigration } from "./migrations/013-alert-read-indexes.js";
import { diagnosticOrderIndexesMigration } from "./migrations/014-diagnostic-order-indexes.js";
import { alertVariantAssetForeignKeysMigration } from "./migrations/015-alert-variant-asset-foreign-keys.js";
import { overlayKeyLookupIndexesMigration } from "./migrations/016-overlay-key-lookup-indexes.js";

export interface StreamJamsMigration {
  readonly id: string;
  readonly sql: string;
}

export interface StreamJamsDatabase extends Disposable {
  readonly connection: DatabaseSync;
  runMigrations(): void;
  close(): void;
}

const migrations = [
  initialSchemaMigration,
  alertVariantSelectionMigration,
  twitchAccountsMigration,
  overlayKeySecretRefMigration,
  providerRegistrationsMigration,
  overlayKeyTargetProfileMigration,
  alertSetManagementMigration,
  assetLibraryMetadataMigration,
  alertEditorDocumentsMigration,
  variantAlertEditorDocumentsMigration,
  alertVariantOrderMigration,
  revokeUnsupportedOverlayKeysMigration,
  alertReadIndexesMigration,
  diagnosticOrderIndexesMigration,
  alertVariantAssetForeignKeysMigration,
  overlayKeyLookupIndexesMigration
] satisfies readonly StreamJamsMigration[];

export const currentSchemaVersion = migrations.length;

export function openStreamJamsDatabase(databasePath: string): StreamJamsDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });
  return createStreamJamsDatabase(databasePath);
}

export function createInMemoryStreamJamsDatabase(): StreamJamsDatabase {
  return createStreamJamsDatabase(":memory:");
}

export function runInTransaction<T>(connection: DatabaseSync, work: () => T): T {
  const transaction = beginTransaction(connection);

  try {
    const result = work();
    transaction.commit();
    return result;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

let nextSavepointId = 0;

function beginTransaction(connection: DatabaseSync): { commit(): void; rollback(): void } {
  if (!connection.isTransaction) {
    connection.exec("BEGIN IMMEDIATE");
    return {
      commit: () => connection.exec("COMMIT"),
      rollback: () => connection.exec("ROLLBACK")
    };
  }

  const name = `stream_jams_${++nextSavepointId}`;
  connection.exec(`SAVEPOINT ${name}`);
  return {
    commit: () => connection.exec(`RELEASE SAVEPOINT ${name}`),
    rollback() {
      connection.exec(`ROLLBACK TO SAVEPOINT ${name}`);
      connection.exec(`RELEASE SAVEPOINT ${name}`);
    }
  };
}

function createStreamJamsDatabase(databasePath: string): StreamJamsDatabase {
  const connection = new DatabaseSync(databasePath, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    allowUnknownNamedParameters: false,
    defensive: true,
    timeout: 5_000
  });
  connection.exec("PRAGMA foreign_keys = ON");

  const database = new NodeSqliteStreamJamsDatabase(connection);
  try {
    database.runMigrations();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

class NodeSqliteStreamJamsDatabase implements StreamJamsDatabase {
  readonly connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  runMigrations(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const appliedCount = validateMigrationHistory(this.connection);
    for (const migration of migrations.slice(appliedCount)) {
      runInTransaction(this.connection, () => {
        this.connection.exec(migration.sql);
        insertMigrationRecord(this.connection, migration.id);
      });
    }
  }

  close(): void {
    if (this.connection.isOpen) {
      this.connection.close();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

function validateMigrationHistory(connection: DatabaseSync): number {
  const appliedIds = connection
    .prepare("SELECT id FROM schema_migrations ORDER BY rowid")
    .all()
    .map((row) => String(row.id));
  const knownIds: ReadonlySet<string> = new Set(migrations.map((migration) => migration.id));

  for (const [index, appliedId] of appliedIds.entries()) {
    const expectedId = migrations[index]?.id;
    if (expectedId === appliedId) {
      continue;
    }

    const position = index + 1;
    if (expectedId === undefined || !knownIds.has(appliedId)) {
      throw new Error(
        `Database migration history contains unknown or future migration "${appliedId}" at position ${position}. ` +
          "Open this database with an application version that recognizes its schema or restore a compatible backup."
      );
    }

    throw new Error(
      `Database migration history is not an exact known prefix at position ${position}: ` +
        `expected "${expectedId}", found "${appliedId}". Restore a compatible database before restarting.`
    );
  }

  return appliedIds.length;
}

function insertMigrationRecord(connection: DatabaseSync, migrationId: string): StatementResultingChanges {
  return connection.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
    migrationId,
    new Date().toISOString()
  );
}
