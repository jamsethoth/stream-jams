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
  alertVariantOrderMigration
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

const asyncTransactionQueues = new WeakMap<DatabaseSync, { tail: Promise<void> }>();

export async function runInTransactionAsync<T>(connection: DatabaseSync, work: () => Promise<T>): Promise<T> {
  const queue = asyncTransactionQueues.get(connection) ?? { tail: Promise.resolve() };
  const previous = queue.tail;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.tail = current;
  asyncTransactionQueues.set(connection, queue);
  await previous;

  try {
    const transaction = beginTransaction(connection);
    try {
      const result = await work();
      transaction.commit();
      return result;
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  } finally {
    release();
    if (queue.tail === current) asyncTransactionQueues.delete(connection);
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
  database.runMigrations();
  return database;
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

    for (const migration of migrations) {
      const alreadyApplied = this.connection
        .prepare("SELECT id FROM schema_migrations WHERE id = ?")
        .get(migration.id);

      if (alreadyApplied !== undefined) {
        continue;
      }

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

function insertMigrationRecord(connection: DatabaseSync, migrationId: string): StatementResultingChanges {
  return connection.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
    migrationId,
    new Date().toISOString()
  );
}
