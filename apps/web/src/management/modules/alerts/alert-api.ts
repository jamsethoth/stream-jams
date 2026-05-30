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

export interface AlertConfigurationApi {
  listCollections(): Promise<readonly AlertCollection[]>;
  listRules(): Promise<readonly AlertRule[]>;
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
