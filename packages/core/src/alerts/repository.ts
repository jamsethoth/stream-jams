import type { AlertCollection, AlertRule } from "./types.js";
import type { StreamEventType } from "../events/types.js";

export interface AlertRepository {
  saveCollection(collection: AlertCollection): Promise<AlertCollection>;
  findCollectionById(collectionId: string): Promise<AlertCollection | null>;
  listCollections(): Promise<readonly AlertCollection[]>;
  deleteCollection(collectionId: string): Promise<void>;
  saveRule(rule: AlertRule): Promise<AlertRule>;
  findRuleById(ruleId: string): Promise<AlertRule | null>;
  listRules(): Promise<readonly AlertRule[]>;
  listActiveRules(input?: { readonly eventType?: StreamEventType }): Promise<readonly AlertRule[]>;
  deleteRule(ruleId: string): Promise<void>;
}
