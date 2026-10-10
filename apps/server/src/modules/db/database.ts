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
import { alertTextStyleDefaultsMigration } from "./migrations/017-alert-text-style-defaults.js";
import { alertModerationSettingsMigration } from "./migrations/018-alert-moderation-settings.js";
import { audioOutputRoutesMigration } from "./migrations/019-audio-output-routes.js";
import { overlaySurfacesMigration } from "./migrations/020-overlay-surfaces.js";
import { alertVideoAudioMigration } from "./migrations/021-alert-video-audio.js";
import { screenEffectsMigration } from "./migrations/022-screen-effects.js";
import { screenEffectSetsMigration } from "./migrations/023-screen-effect-sets.js";
import { assetDurationMetadataMigration } from "./migrations/024-asset-duration-metadata.js";
import { removeScreenEffectAnimationsMigration } from "./migrations/025-remove-screen-effect-animations.js";
import { automaticOutputRebindingMigration } from "./migrations/026-automatic-output-rebinding.js";
import { removeAlertSetProfileStateMigration } from "./migrations/027-remove-alert-set-profile-state.js";
import { timerOverlayModuleMigration } from "./migrations/028-timer-overlay-module.js";
import { assetRetirementsMigration } from "./migrations/029-asset-retirements.js";
import { persistentEventTimersMigration } from "./migrations/030-persistent-event-timers.js";
import { musicSourceProvidersMigration } from "./migrations/032-music-source-providers.js";

import { automationGrantsMigration } from "./migrations/031-automation-grants.js";
import { eventBusJournalMigration } from "./migrations/034-event-bus-journal.js";
import { eventBusCorrelationMigration } from "./migrations/035-event-bus-correlation.js";
import { eventSourceActivePerKindMigration } from "./migrations/036-event-source-active-per-kind.js";
import { eventTriggerSelectorsMigration } from "./migrations/037-event-trigger-selectors.js";
import { externalAlertIdentityMigration } from "./migrations/038-external-alert-identity.js";
import { eventBusOutcomesMigration } from "./migrations/039-event-bus-outcomes.js";
import { videoRequestQueueMigration } from "./migrations/040-video-request-queue.js";

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
  overlayKeyLookupIndexesMigration,
  alertTextStyleDefaultsMigration,
  alertModerationSettingsMigration,
  audioOutputRoutesMigration,
  overlaySurfacesMigration,
  alertVideoAudioMigration,
  screenEffectsMigration,
  screenEffectSetsMigration,
  assetDurationMetadataMigration,
  removeScreenEffectAnimationsMigration,
  automaticOutputRebindingMigration,
  removeAlertSetProfileStateMigration,
  timerOverlayModuleMigration,
  assetRetirementsMigration,
  persistentEventTimersMigration,
  automationGrantsMigration,
  musicSourceProvidersMigration,
  eventBusJournalMigration,
  eventBusCorrelationMigration,
  eventSourceActivePerKindMigration,
  eventTriggerSelectorsMigration,
  externalAlertIdentityMigration,
  eventBusOutcomesMigration,
  videoRequestQueueMigration
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

    // Preserve the exact pre-merge Music preview history while inserting main's migration.
    const history = this.connection.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY rowid").all();
    if (history.length === 31 && history[30]?.id === "031-music-source-providers"
      && history.slice(0, 30).every((row, index) => row.id === migrations[index]?.id)) {
      runInTransaction(this.connection, () => {
        this.connection.prepare("DELETE FROM schema_migrations WHERE id = ?").run("031-music-source-providers");
        this.connection.exec(automationGrantsMigration.sql);
        insertMigrationRecord(this.connection, automationGrantsMigration.id);
        this.connection.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(musicSourceProvidersMigration.id, String(history[30]!.applied_at));
      });
    }
    reconcilePreMergeVideosHistory(this.connection);
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

/**
 * A Videos build made before the event bus merge applied its queue migration as "033-video-request-queue" right
 * after the Music providers migration. Main's event bus migrations come first now, so that history runs them and
 * keeps its already-applied Videos tables under the queue migration's current ID and original time.
 */
function reconcilePreMergeVideosHistory(connection: DatabaseSync): void {
  const history = connection.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY rowid").all();
  const musicIndex = migrations.indexOf(musicSourceProvidersMigration);
  const videosIndex = migrations.indexOf(videoRequestQueueMigration);
  if (history.length !== musicIndex + 2 || history[musicIndex + 1]?.id !== "033-video-request-queue"
    || !history.slice(0, musicIndex + 1).every((row, index) => row.id === migrations[index]?.id)) return;
  runInTransaction(connection, () => {
    connection.prepare("DELETE FROM schema_migrations WHERE id = ?").run("033-video-request-queue");
    for (const migration of migrations.slice(musicIndex + 1, videosIndex)) {
      connection.exec(migration.sql);
      insertMigrationRecord(connection, migration.id);
    }
    connection.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(videoRequestQueueMigration.id, String(history[musicIndex + 1]!.applied_at));
  });
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
