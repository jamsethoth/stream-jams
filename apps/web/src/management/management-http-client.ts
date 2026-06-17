import { readHttpError } from "./http-errors.js";

export interface HttpManagementClientOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
  readonly csrfToken: string;
}

interface JsonRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly fallbackMessage: string;
}

export interface ManagementHttpClient {
  getJson<T>(path: string, fallbackMessage: string): Promise<T>;
  postJson<T>(path: string, body: unknown | undefined, fallbackMessage: string): Promise<T>;
  putJson<T>(path: string, body: unknown, fallbackMessage: string): Promise<T>;
  patchJson<T>(path: string, body: unknown, fallbackMessage: string): Promise<T>;
  deleteJson<T>(path: string, fallbackMessage: string): Promise<T>;
  deleteRequest(path: string, fallbackMessage: string): Promise<void>;
}

export function createManagementHttpClient(options: HttpManagementClientOptions = {}): ManagementHttpClient {
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

  async function request(path: string, options: RequestInit, fallbackMessage: string): Promise<Response> {
    const response = await fetcher(path, options);
    if (!response.ok) {
      throw new Error(await readHttpError(response, fallbackMessage));
    }

    return response;
  }

  async function requestJson<T>(path: string, options: JsonRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const hasBody = options.body !== undefined;
    const session = await getSession();
    const response = await request(
      path,
      {
        ...(method === "GET" ? {} : { method }),
        headers: {
          authorization: `Bearer ${session.id}`,
          ...(method === "GET" ? {} : { "x-stream-jams-csrf": session.csrfToken }),
          ...(hasBody ? { "content-type": "application/json" } : {})
        },
        ...(hasBody ? { body: JSON.stringify(options.body) } : {})
      },
      options.fallbackMessage
    );

    return (await response.json()) as T;
  }

  return {
    getJson<T>(path: string, fallbackMessage: string) {
      return requestJson<T>(path, { fallbackMessage });
    },
    postJson<T>(path: string, body: unknown | undefined, fallbackMessage: string) {
      return requestJson<T>(path, { method: "POST", body, fallbackMessage });
    },
    putJson<T>(path: string, body: unknown, fallbackMessage: string) {
      return requestJson<T>(path, { method: "PUT", body, fallbackMessage });
    },
    patchJson<T>(path: string, body: unknown, fallbackMessage: string) {
      return requestJson<T>(path, { method: "PATCH", body, fallbackMessage });
    },
    deleteJson<T>(path: string, fallbackMessage: string) {
      return requestJson<T>(path, { method: "DELETE", fallbackMessage });
    },
    async deleteRequest(path: string, fallbackMessage: string) {
      const session = await getSession();
      await request(
        path,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${session.id}`,
            "x-stream-jams-csrf": session.csrfToken
          }
        },
        fallbackMessage
      );
    }
  };
}
