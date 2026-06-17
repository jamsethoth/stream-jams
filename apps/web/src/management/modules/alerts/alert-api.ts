import { readHttpError } from "../../http-errors.js";

export interface AlertCollection {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface AlertCondition {
  readonly field: "amount" | "tier" | "rewardId";
  readonly operator: "equals" | "min" | "max" | "range" | "includes";
  readonly value: string | number | boolean | readonly [number, number];
}

export interface AlertLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
}

export interface AlertVariant {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly conditions?: readonly AlertCondition[] | undefined;
  readonly priority?: number | undefined;
  readonly visualAssetId: string | null;
  readonly audioAssetId: string | null;
  readonly textTemplate: string;
  readonly ttsConfig: null;
  readonly durationMs: number;
  readonly layout: AlertLayout;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly eventType: AlertEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly AlertCondition[];
  readonly variants: readonly AlertVariant[];
  readonly cooldownSeconds: number;
  readonly priority: number;
}

export type AlertEventType = "follow" | "subscription" | "resubscription" | "cheer" | "raid" | "channel_point_redemption";

export interface CreateAlertCollectionInput {
  readonly name: string;
  readonly enabled?: boolean | undefined;
}

export type UpdateAlertCollectionInput = Omit<AlertCollection, "id">;

export interface CreateAlertRuleInput {
  readonly name: string;
  readonly eventType: AlertEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly AlertCondition[];
  readonly variants: readonly CreateAlertVariantInput[];
  readonly cooldownSeconds: number;
  readonly priority: number;
}

export type UpdateAlertRuleInput = Omit<AlertRule, "id">;

export interface CreateAlertVariantInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly conditions?: readonly AlertCondition[] | undefined;
  readonly priority?: number | undefined;
  readonly visualAssetId: string | null;
  readonly audioAssetId: string | null;
  readonly textTemplate: string;
  readonly ttsConfig: null;
  readonly durationMs: number;
  readonly layout: AlertLayout;
}

export type AlertTestStatus = "queued" | "duplicate" | "no-matches" | "cooldown";

export interface AlertTestResult {
  readonly status: AlertTestStatus;
  readonly matchedRuleIds: readonly string[];
  readonly enqueuedAlertIds: readonly string[];
}

export type AlertTestEventInput =
  | BaseAlertTestEventInput & { readonly type: "follow"; readonly amount: null }
  | BaseAlertTestEventInput & { readonly type: "subscription"; readonly amount: number; readonly tier: "1000" | "2000" | "3000" | "prime" }
  | BaseAlertTestEventInput & { readonly type: "resubscription"; readonly amount: number; readonly tier: "1000" | "2000" | "3000" | "prime"; readonly streakMonths: number | null }
  | BaseAlertTestEventInput & { readonly type: "cheer"; readonly amount: number }
  | BaseAlertTestEventInput & { readonly type: "raid"; readonly amount: number }
  | BaseAlertTestEventInput & {
      readonly type: "channel_point_redemption";
      readonly amount: null;
      readonly rewardId: string;
      readonly rewardTitle: string;
      readonly userInput: string | null;
    };

interface BaseAlertTestEventInput {
  readonly id: string;
  readonly providerId: "twitch";
  readonly sourcePlatform: "twitch";
  readonly ingestProvider: "twitch";
  readonly occurredAt: string;
  readonly actor: {
    readonly id: string | null;
    readonly displayName: string;
  };
  readonly message: string | null;
  readonly metadata: Record<string, unknown>;
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

export interface HttpAlertConfigurationApiOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
  readonly csrfToken: string;
}

export function createHttpAlertConfigurationApi(options: HttpAlertConfigurationApiOptions = {}): AlertConfigurationApi {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let sessionId: string | null = null;
  let csrfToken: string | null = null;

  async function getSession(): Promise<{ readonly id: string; readonly csrfToken: string }> {
    if (sessionId !== null && csrfToken !== null) {
      return {
        id: sessionId,
        csrfToken
      };
    }

    const response = await fetcher("/auth/management/sessions", {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to create management session."));
    }

    const session = (await response.json()) as ManagementSessionResponse;
    sessionId = session.id;
    csrfToken = session.csrfToken;
    return session;
  }

  async function managementHeaders(extraHeaders: HeadersInit = {}, includeCsrf = false): Promise<HeadersInit> {
    const session = await getSession();
    return {
      ...extraHeaders,
      authorization: `Bearer ${session.id}`,
      ...(includeCsrf ? { "x-stream-jams-csrf": session.csrfToken } : {})
    };
  }

  async function jsonHeaders(): Promise<HeadersInit> {
    return managementHeaders({
      "content-type": "application/json"
    }, true);
  }

  return {
    async listCollections() {
      const response = await fetcher("/alert-collections", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load alert collections."));
      }

      return (await response.json()) as readonly AlertCollection[];
    },

    async listRules() {
      const response = await fetcher("/alerts/rules", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load alert rules."));
      }

      return (await response.json()) as readonly AlertRule[];
    },

    async createCollection(input: CreateAlertCollectionInput) {
      const response = await fetcher("/alert-collections", {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to create alert collection."));
      }

      return (await response.json()) as AlertCollection;
    },

    async updateCollection(collectionId: string, input: UpdateAlertCollectionInput) {
      const response = await fetcher(`/alert-collections/${encodeURIComponent(collectionId)}`, {
        method: "PUT",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update alert collection."));
      }

      return (await response.json()) as AlertCollection;
    },

    async deleteCollection(collectionId: string) {
      const response = await fetcher(`/alert-collections/${encodeURIComponent(collectionId)}`, {
        method: "DELETE",
        headers: await managementHeaders({}, true)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to delete alert collection."));
      }
    },

    async createRule(input: CreateAlertRuleInput) {
      const response = await fetcher("/alerts/rules", {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to create alert rule."));
      }

      return (await response.json()) as AlertRule;
    },

    async updateRule(ruleId: string, input: UpdateAlertRuleInput) {
      const response = await fetcher(`/alerts/rules/${encodeURIComponent(ruleId)}`, {
        method: "PUT",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update alert rule."));
      }

      return (await response.json()) as AlertRule;
    },

    async deleteRule(ruleId: string) {
      const response = await fetcher(`/alerts/rules/${encodeURIComponent(ruleId)}`, {
        method: "DELETE",
        headers: await managementHeaders({}, true)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to delete alert rule."));
      }
    },

    async deleteVariant(ruleId: string, variantId: string) {
      const response = await fetcher(
        `/alerts/rules/${encodeURIComponent(ruleId)}/variants/${encodeURIComponent(variantId)}`,
        {
          method: "DELETE",
          headers: await managementHeaders({}, true)
        }
      );
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to delete alert variant."));
      }

      return (await response.json()) as AlertRule;
    },

    async setCollectionEnabled(collectionId: string, enabled: boolean) {
      const response = await fetcher(`/alert-collections/${encodeURIComponent(collectionId)}/enabled`, {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update alert collection."));
      }

      return (await response.json()) as AlertCollection;
    },

    async setRuleEnabled(ruleId: string, enabled: boolean) {
      const response = await fetcher(`/alerts/rules/${encodeURIComponent(ruleId)}/enabled`, {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update alert rule."));
      }

      return (await response.json()) as AlertRule;
    },

    async testAlert(input: AlertTestEventInput) {
      const response = await fetcher("/alerts/test", {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to run test alert."));
      }

      return (await response.json()) as AlertTestResult;
    }
  };
}
