export interface AlertCollection {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface AlertVariant {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly eventType: string;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly variants: readonly AlertVariant[];
  readonly priority: number;
}

export type AlertEventType = "follow" | "subscription" | "resubscription" | "cheer" | "raid" | "channel_point_redemption";

export interface CreateAlertCollectionInput {
  readonly name: string;
  readonly enabled?: boolean | undefined;
}

export interface CreateAlertRuleInput {
  readonly name: string;
  readonly eventType: AlertEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly [];
  readonly variants: readonly CreateAlertVariantInput[];
  readonly cooldownSeconds: number;
  readonly priority: number;
}

export interface CreateAlertVariantInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly visualAssetId: string | null;
  readonly audioAssetId: string | null;
  readonly textTemplate: string;
  readonly ttsConfig: null;
  readonly durationMs: number;
  readonly layout: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly zIndex: number;
  };
}

export interface AlertConfigurationApi {
  listCollections(): Promise<readonly AlertCollection[]>;
  listRules(): Promise<readonly AlertRule[]>;
  createCollection(input: CreateAlertCollectionInput): Promise<AlertCollection>;
  createRule(input: CreateAlertRuleInput): Promise<AlertRule>;
  setCollectionEnabled(collectionId: string, enabled: boolean): Promise<AlertCollection>;
  setRuleEnabled(ruleId: string, enabled: boolean): Promise<AlertRule>;
}

export interface HttpAlertConfigurationApiOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
}

export function createHttpAlertConfigurationApi(options: HttpAlertConfigurationApiOptions = {}): AlertConfigurationApi {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let sessionId: string | null = null;

  async function getSessionId(): Promise<string> {
    if (sessionId !== null) {
      return sessionId;
    }

    const response = await fetcher("/auth/management/sessions", {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to create management session."));
    }

    const session = (await response.json()) as ManagementSessionResponse;
    sessionId = session.id;
    return session.id;
  }

  async function managementHeaders(extraHeaders: HeadersInit = {}): Promise<HeadersInit> {
    return {
      ...extraHeaders,
      authorization: `Bearer ${await getSessionId()}`
    };
  }

  async function jsonHeaders(): Promise<HeadersInit> {
    return managementHeaders({
      "content-type": "application/json"
    });
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
    }
  };
}

async function readHttpError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { readonly error?: { readonly message?: unknown } };
    return typeof body.error?.message === "string" ? body.error.message : fallback;
  } catch {
    return fallback;
  }
}
