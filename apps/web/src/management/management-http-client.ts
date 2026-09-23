import { formatHttpError, readHttpErrorDetails, type HttpErrorOwner, type HttpErrorReference } from "./http-errors.js";

export interface HttpManagementClientOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
  readonly csrfToken: string;
}

type ManagementSession = ManagementSessionResponse;

type ManagementMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ManagementRawRequestOptions {
  readonly method?: ManagementMethod;
  readonly headers?: HeadersInit;
  readonly body?: BodyInit | null;
  readonly fallbackMessage: string;
}

interface JsonRequestOptions {
  readonly method?: ManagementMethod;
  readonly body?: unknown;
  readonly fallbackMessage: string;
}

export interface ManagementHttpClient {
  request(path: string, options: ManagementRawRequestOptions): Promise<Response>;
  getJson<T>(path: string, fallbackMessage: string): Promise<T>;
  postJson<T>(path: string, body: unknown | undefined, fallbackMessage: string): Promise<T>;
  postRequest(path: string, fallbackMessage: string, body?: unknown): Promise<void>;
  putJson<T>(path: string, body: unknown, fallbackMessage: string): Promise<T>;
  patchJson<T>(path: string, body: unknown, fallbackMessage: string): Promise<T>;
  deleteJson<T>(path: string, fallbackMessage: string): Promise<T>;
  deleteRequest(path: string, fallbackMessage: string, body?: unknown): Promise<void>;
}

export class ManagementHttpError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly referenceId: string | null,
    readonly nextStep: string | null = null,
    readonly references: readonly HttpErrorReference[] = [],
    readonly owners: readonly HttpErrorOwner[] = [],
    readonly status: number | null = null,
    readonly conflictSnapshot: unknown = null
  ) {
    super(message);
    this.name = "ManagementHttpError";
  }
}

async function createManagementHttpError(response: Response, fallback: string): Promise<ManagementHttpError> {
  const payloadResponse = response.clone();
  const details = await readHttpErrorDetails(response, fallback);
  const payload = await payloadResponse.json().catch(() => null) as unknown;
  const conflictSnapshot = details.code === "PLAYBACK_OPERATION_CONFLICT"
    && typeof payload === "object"
    && payload !== null
    && "snapshot" in payload
    ? payload.snapshot
    : null;
  return new ManagementHttpError(
    formatHttpError(details),
    details.code,
    details.referenceId,
    details.nextStep,
    details.references,
    details.owners,
    response.status,
    conflictSnapshot
  );
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
      throw await createManagementHttpError(response, "Unable to create management session.");
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
      throw await createManagementHttpError(response, fallbackMessage);
    }

    return response;
  }

  async function request(path: string, options: ManagementRawRequestOptions): Promise<Response> {
    const method = options.method ?? "GET";
    return requestWithSession(
      path,
      (session) => {
        const headers = new Headers(options.headers);
        headers.set("authorization", `Bearer ${session.id}`);
        if (method === "GET") {
          headers.delete("x-stream-jams-csrf");
        } else {
          headers.set("x-stream-jams-csrf", session.csrfToken);
        }
        return {
          ...(method === "GET" ? {} : { method }),
          headers,
          ...(options.body === undefined ? {} : { body: options.body })
        };
      },
      options.fallbackMessage
    );
  }

  async function requestJson<T>(path: string, options: JsonRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const hasBody = options.body !== undefined;
    const response = await request(path, {
      method,
      ...(hasBody ? {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(options.body)
      } : {}),
      fallbackMessage: options.fallbackMessage
    });

    return (await response.json()) as T;
  }

  return {
    request,
    getJson<T>(path: string, fallbackMessage: string) {
      return requestJson<T>(path, { fallbackMessage });
    },
    postJson<T>(path: string, body: unknown | undefined, fallbackMessage: string) {
      return requestJson<T>(path, { method: "POST", body, fallbackMessage });
    },
    async postRequest(path: string, fallbackMessage: string, body?: unknown) {
      const hasBody = body !== undefined;
      await request(path, {
        method: "POST",
        ...(hasBody ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        } : {}),
        fallbackMessage
      });
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
      await request(path, {
        method: "DELETE",
        ...(hasBody ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        } : {}),
        fallbackMessage
      });
    }
  };
}
