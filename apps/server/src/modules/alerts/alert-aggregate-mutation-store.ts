import type {
  AlertCollection,
  AlertEditorDocument,
  AlertRule
} from "@stream-jams/core";
import type {
  AlertRuleManagementMetadata,
  AlertSetMetadata
} from "./alert-set-management-service.js";

export interface AlertAggregateMutation {
  readonly expectedCollections?: readonly AlertCollection[];
  readonly expectedRules?: readonly AlertRule[];
  readonly missingCollectionIds?: readonly string[];
  readonly missingRuleIds?: readonly string[];
  readonly saveCollections?: readonly AlertCollection[];
  readonly saveRules?: readonly AlertRule[];
  readonly saveSetMetadata?: readonly AlertSetMetadata[];
  readonly saveRuleMetadata?: readonly AlertRuleManagementMetadata[];
  readonly saveDocuments?: readonly AlertEditorDocument[];
  readonly deleteDocumentIds?: readonly string[];
  readonly deleteRuleMetadataIds?: readonly string[];
  readonly deleteRuleIds?: readonly string[];
  readonly deleteSetMetadataIds?: readonly string[];
  readonly deleteCollectionIds?: readonly string[];
}

export interface AlertAggregateMutationStore {
  commit(mutation: AlertAggregateMutation): void;
}
