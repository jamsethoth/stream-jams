import { readHttpError } from "./http-errors.js";

export interface HttpManagementClientOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
  readonly csrfToken: string;
}

type ManagementSession = ManagementSessionResponse;

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
  deleteRequest(path: string, fallbackMessage: string, body?: unknown): Promise<void>;
}

export function createManagementHttpClient(options: HttpManagementClientOptions = {}): ManagementHttpClient {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let sessionId: string | null = null;
  let csrfToken: string | null = null;

  async function getSession(): Promise<ManagementSession> {
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

  function invalidateSession(session: ManagementSession): void {
    if (sessionId === session.id) {
      sessionId = null;
      csrfToken = null;
    }
  }

  async function requestWithSession(
    path: string,
    createOptions: (session: ManagementSession) => RequestInit,
    fallbackMessage: string
  ): Promise<Response> {
    let session = await getSession();
    let response = await fetcher(path, createOptions(session));
    if (response.status === 401) {
      invalidateSession(session);
      session = await getSession();
      response = await fetcher(path, createOptions(session));
    }

    if (!response.ok) {
      throw new Error(await readHttpError(response, fallbackMessage));
    }

    return response;
  }

  async function requestJson<T>(path: string, options: JsonRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const hasBody = options.body !== undefined;
    const response = await requestWithSession(
      path,
      (session) => ({
        ...(method === "GET" ? {} : { method }),
        headers: {
          authorization: `Bearer ${session.id}`,
          ...(method === "GET" ? {} : { "x-stream-jams-csrf": session.csrfToken }),
          ...(hasBody ? { "content-type": "application/json" } : {})
        },
        ...(hasBody ? { body: JSON.stringify(options.body) } : {})
      }),
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
    async deleteRequest(path: string, fallbackMessage: string, body?: unknown) {
      const hasBody = body !== undefined;
      await requestWithSession(
        path,
        (session) => ({
          method: "DELETE",
          headers: {
            authorization: `Bearer ${session.id}`,
            "x-stream-jams-csrf": session.csrfToken,
            ...(hasBody ? { "content-type": "application/json" } : {})
          },
          ...(hasBody ? { body: JSON.stringify(body) } : {})
        }),
        fallbackMessage
      );
    }
  };
}
