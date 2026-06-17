import type {
  AlertCollection,
  AlertRule,
  CreateAlertCollectionInput,
  CreateAlertRuleInput,
  NormalizedStreamEvent,
  StreamEventType,
  UpdateAlertCollectionInput,
  UpdateAlertRuleInput
} from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../../management-http-client.js";

export type {
  AlertCollection,
  AlertCondition,
  AlertRule,
  AlertVariant,
  CreateAlertCollectionInput,
  CreateAlertRuleInput,
  CreateAlertVariantInput,
  UpdateAlertCollectionInput,
  UpdateAlertRuleInput,
  UpdateAlertVariantInput
} from "@stream-jams/core";

export type AlertEventType = StreamEventType;
export type AlertTestEventInput = NormalizedStreamEvent;

export type AlertTestStatus = "queued" | "duplicate" | "no-matches" | "cooldown";

export interface AlertTestResult {
  readonly status: AlertTestStatus;
  readonly matchedRuleIds: readonly string[];
  readonly enqueuedAlertIds: readonly string[];
}

export interface AlertConfigurationApi {
  listCollections(): Promise<readonly AlertCollection[]>;
  listRules(): Promise<readonly AlertRule[]>;
  createCollection(input: CreateAlertCollectionInput): Promise<AlertCollection>;
  updateCollection(collectionId: string, input: UpdateAlertCollectionInput): Promise<AlertCollection>;
  deleteCollection(collectionId: string): Promise<void>;
  createRule(input: CreateAlertRuleInput): Promise<AlertRule>;
  updateRule(ruleId: string, input: UpdateAlertRuleInput): Promise<AlertRule>;
  deleteRule(ruleId: string): Promise<void>;
  deleteVariant(ruleId: string, variantId: string): Promise<AlertRule>;
  setCollectionEnabled(collectionId: string, enabled: boolean): Promise<AlertCollection>;
  setRuleEnabled(ruleId: string, enabled: boolean): Promise<AlertRule>;
  testAlert(input: AlertTestEventInput): Promise<AlertTestResult>;
}

export type HttpAlertConfigurationApiOptions = HttpManagementClientOptions;

export function createHttpAlertConfigurationApi(options: HttpAlertConfigurationApiOptions = {}): AlertConfigurationApi {
  const client = createManagementHttpClient(options);

  return {
    async listCollections() {
      return client.getJson<readonly AlertCollection[]>("/alert-collections", "Unable to load alert collections.");
    },

    async listRules() {
      return client.getJson<readonly AlertRule[]>("/alerts/rules", "Unable to load alert rules.");
    },

    async createCollection(input: CreateAlertCollectionInput) {
      return client.postJson<AlertCollection>("/alert-collections", input, "Unable to create alert collection.");
    },

    async updateCollection(collectionId: string, input: UpdateAlertCollectionInput) {
      return client.putJson<AlertCollection>(
        `/alert-collections/${encodeURIComponent(collectionId)}`,
        input,
        "Unable to update alert collection."
      );
    },

    async deleteCollection(collectionId: string) {
      await client.deleteRequest(
        `/alert-collections/${encodeURIComponent(collectionId)}`,
        "Unable to delete alert collection."
      );
    },

    async createRule(input: CreateAlertRuleInput) {
      return client.postJson<AlertRule>("/alerts/rules", input, "Unable to create alert rule.");
    },

    async updateRule(ruleId: string, input: UpdateAlertRuleInput) {
      return client.putJson<AlertRule>(
        `/alerts/rules/${encodeURIComponent(ruleId)}`,
        input,
        "Unable to update alert rule."
      );
    },

    async deleteRule(ruleId: string) {
      await client.deleteRequest(`/alerts/rules/${encodeURIComponent(ruleId)}`, "Unable to delete alert rule.");
    },

    async deleteVariant(ruleId: string, variantId: string) {
      return client.deleteJson<AlertRule>(
        `/alerts/rules/${encodeURIComponent(ruleId)}/variants/${encodeURIComponent(variantId)}`,
        "Unable to delete alert variant."
      );
    },

    async setCollectionEnabled(collectionId: string, enabled: boolean) {
      return client.patchJson<AlertCollection>(
        `/alert-collections/${encodeURIComponent(collectionId)}/enabled`,
        { enabled },
        "Unable to update alert collection."
      );
    },

    async setRuleEnabled(ruleId: string, enabled: boolean) {
      return client.patchJson<AlertRule>(
        `/alerts/rules/${encodeURIComponent(ruleId)}/enabled`,
        { enabled },
        "Unable to update alert rule."
      );
    },

    async testAlert(input: AlertTestEventInput) {
      return client.postJson<AlertTestResult>("/alerts/test", input, "Unable to run test alert.");
    }
  };
}
