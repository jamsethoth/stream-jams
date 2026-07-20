import type { DatabaseSync } from "node:sqlite";
import type { AlertCollection, AlertRule } from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";
import type {
  AlertAggregateMutation,
  AlertAggregateMutationStore
} from "./alert-aggregate-mutation-store.js";
import type { SqliteAlertEditorDocumentRepository } from "./sqlite-alert-editor-document-repository.js";
import type { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import type { SqliteAlertSetMetadataRepository } from "./sqlite-alert-set-metadata-repository.js";

export class SqliteAlertAggregateMutationStore implements AlertAggregateMutationStore {
  readonly #connection: DatabaseSync;
  readonly #alerts: SqliteAlertRepository;
  readonly #metadata: SqliteAlertSetMetadataRepository;
  readonly #documents: SqliteAlertEditorDocumentRepository;

  constructor(
    connection: DatabaseSync,
    alerts: SqliteAlertRepository,
    metadata: SqliteAlertSetMetadataRepository,
    documents: SqliteAlertEditorDocumentRepository
  ) {
    this.#connection = connection;
    this.#alerts = alerts;
    this.#metadata = metadata;
    this.#documents = documents;
  }

  commit(mutation: AlertAggregateMutation): void {
    runInTransaction(this.#connection, () => {
      for (const expected of mutation.expectedCollections ?? []) {
        assertUnchanged("alert collection", expected.id, expected, this.#alerts.findCollectionByIdSync(expected.id));
      }
      for (const expected of mutation.expectedRules ?? []) {
        assertUnchanged("alert rule", expected.id, expected, this.#alerts.findRuleByIdSync(expected.id));
      }
      for (const id of mutation.missingCollectionIds ?? []) {
        assertMissing("alert collection", id, this.#alerts.findCollectionByIdSync(id));
      }
      for (const id of mutation.missingRuleIds ?? []) {
        assertMissing("alert rule", id, this.#alerts.findRuleByIdSync(id));
      }

      for (const collection of mutation.saveCollections ?? []) this.#alerts.saveCollectionSync(collection);
      for (const metadata of mutation.saveSetMetadata ?? []) this.#metadata.saveSetSync(metadata);
      for (const rule of mutation.saveRules ?? []) this.#alerts.saveRuleSync(rule);
      for (const metadata of mutation.saveRuleMetadata ?? []) this.#metadata.saveRuleSync(metadata);
      for (const document of mutation.saveDocuments ?? []) this.#documents.saveSync(document);
      for (const id of mutation.deleteDocumentIds ?? []) this.#documents.deleteSync(id);
      for (const id of mutation.deleteRuleMetadataIds ?? []) this.#metadata.deleteRuleSync(id);
      for (const id of mutation.deleteRuleIds ?? []) this.#alerts.deleteRuleSync(id);
      for (const id of mutation.deleteSetMetadataIds ?? []) this.#metadata.deleteSetSync(id);
      for (const id of mutation.deleteCollectionIds ?? []) this.#alerts.deleteCollectionSync(id);
    });
  }
}

function assertUnchanged<T extends AlertCollection | AlertRule>(
  kind: string,
  id: string,
  expected: T,
  actual: T | null
): void {
  if (actual === null || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`The ${kind} "${id}" changed before the mutation could be committed`);
  }
}

function assertMissing(kind: string, id: string, actual: unknown): void {
  if (actual !== null) {
    throw new Error(`The generated ${kind} id "${id}" is already in use`);
  }
}
