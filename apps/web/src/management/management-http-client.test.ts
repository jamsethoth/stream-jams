import { describe, expect, it, vi } from "vitest";
import { ManagementHttpError, createManagementHttpClient } from "./management-http-client.js";

describe("createManagementHttpClient", () => {
  it("retries session creation after a shared attempt fails", async () => {
    let rejectSession!: (error: Error) => void;
    const failedSession = new Promise<Response>((_resolve, reject) => { rejectSession = reject; });
    let sessions = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/auth/management/sessions") {
        sessions++;
        return sessions === 1 ? failedSession : jsonResponse({ id: "replacement", csrfToken: "replacement_csrf" });
      }
      return jsonResponse({ ok: true });
    });
    const client = createManagementHttpClient({ fetch: fetcher });
    const failure = new Error("Session transport failed");
    const requests = Promise.allSettled([
      client.getJson("/first", "Unable to read."),
      client.getJson("/second", "Unable to read.")
    ]);
    rejectSession(failure);
    expect(await requests).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure }
    ]);
    expect(sessions).toBe(1);
    await expect(client.getJson("/retry", "Unable to read.")).resolves.toEqual({ ok: true });
    expect(sessions).toBe(2);
  });

  it("keeps a renewed session when an older concurrent request returns a late 401", async () => {
    let completeLateRequest!: (response: Response) => void;
    const lateResponse = new Promise<Response>(resolve => { completeLateRequest = resolve; });
    let sessions = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/auth/management/sessions") {
        sessions++;
        return jsonResponse({ id: `session_${sessions}`, csrfToken: `csrf_${sessions}` });
      }
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer session_1") {
        return path === "/late" ? lateResponse : new Response(null, { status: 401 });
      }
      expect(authorization).toBe("Bearer session_2");
      return jsonResponse({ ok: true });
    });
    const client = createManagementHttpClient({ fetch: fetcher });
    const first = client.getJson("/first", "Unable to read.");
    const late = client.getJson("/late", "Unable to read.");
    await expect(first).resolves.toEqual({ ok: true });
    completeLateRequest(new Response(null, { status: 401 }));
    await expect(late).resolves.toEqual({ ok: true });
    expect(sessions).toBe(2);
  });

  it("shares one pending session for concurrent preview owners and their releases", async () => {
    let complete!: (value: Response) => void;
    const session = new Promise<Response>(resolve => { complete = resolve; });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/management/sessions") return session;
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer shared_session");
      expect(headers.get("x-stream-jams-csrf")).toBe("shared_csrf");
      return new Response(null, { status: 204 });
    });
    const client = createManagementHttpClient({ fetch: fetcher });
    const first = client.postRequest("/assets/one/preview", "Unable to create.");
    const second = client.postRequest("/assets/two/preview", "Unable to create.");
    complete(jsonResponse({ id: "shared_session", csrfToken: "shared_csrf" }));
    await Promise.all([first, second]);
    await Promise.all([client.deleteRequest("/assets/previews/one", "Unable to release."), client.deleteRequest("/assets/previews/two", "Unable to release.")]);
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
  });
  it("reuses the management session and sends CSRF headers for mutating JSON requests", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" });
      }

      if (url === "/read") {
        expect(init?.method).toBeUndefined();
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer mgmt_session");
        expect(headers.has("x-stream-jams-csrf")).toBe(false);
        return jsonResponse({ ok: true });
      }

      if (url === "/write") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify({ value: 1 })
        });
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer mgmt_session");
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get("x-stream-jams-csrf")).toBe("csrf_session");
        return jsonResponse({ saved: true });
      }

      if (url === "/deleted") {
        expect(init).toMatchObject({
          method: "DELETE",
          body: JSON.stringify({ confirm: true })
        });
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer mgmt_session");
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get("x-stream-jams-csrf")).toBe("csrf_session");
        return jsonResponse({ deleted: true });
      }

      throw new Error("Unexpected request " + url);
    });
    const client = createManagementHttpClient({ fetch: fetcher });

    await expect(client.getJson("/read", "Unable to read.")).resolves.toEqual({ ok: true });
    await expect(client.postJson("/write", { value: 1 }, "Unable to write.")).resolves.toEqual({ saved: true });
    await expect(client.deleteRequest("/deleted", "Unable to delete.", { confirm: true })).resolves.toBeUndefined();
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
  });

  it("uses fallback messages for non-JSON error responses", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" });
      }

      if (url === "/broken") {
        return new Response("not json", { status: 500 });
      }

      throw new Error("Unexpected request " + url);
    });
    const client = createManagementHttpClient({ fetch: fetcher });

    await expect(client.getJson("/broken", "Fallback message.")).rejects.toThrow("Fallback message.");
  });

  it("retains safe error code and reference metadata for correction links", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" })
        : jsonResponse({
            error: {
              code: "PLAYBACK_CONFIG_WRITE_FAILED",
              id: "err_operator_1",
              message: "Playback protection could not be saved."
            }
          }, { status: 500 })
    );
    const client = createManagementHttpClient({ fetch: fetcher });

    const error = await client.postJson("/playback/mute", undefined, "Unable to mute.").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ManagementHttpError);
    expect(error).toMatchObject({
      message: "Playback protection could not be saved. (PLAYBACK_CONFIG_WRITE_FAILED, err_operator_1)",
      code: "PLAYBACK_CONFIG_WRITE_FAILED",
      referenceId: "err_operator_1"
    });
  });

  it("retains safe audio impact metadata for confirmation and conflict UI", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" })
        : jsonResponse({
            error: {
              code: "AUDIO_ROUTE_REFERENCED",
              message: "This route is still referenced by alerts.",
              nextStep: "Remove the route from the listed alerts before deleting it.",
              references: [{ alertId: "alert-a", name: "New follower" }],
              owners: [{
                moduleId: "screen-effects",
                ownerId: "effect-a",
                ownerName: "Jump scare",
                variantId: "variant-a"
              }]
            }
          }, { status: 409 })
    );
    const client = createManagementHttpClient({ fetch: fetcher });

    const error = await client.deleteRequest("/audio/routes/route-a", "Unable to delete output.").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ManagementHttpError);
    expect(error).toMatchObject({
      nextStep: "Remove the route from the listed alerts before deleting it.",
      references: [{ alertId: "alert-a", name: "New follower" }],
      owners: [{
        moduleId: "screen-effects",
        ownerId: "effect-a",
        ownerName: "Jump scare",
        variantId: "variant-a"
      }]
    });
  });

  it("renews an unauthorized management session and retries the request once", async () => {
    let sessionNumber = 0;
    let readNumber = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        sessionNumber += 1;
        return jsonResponse({ id: `mgmt_session_${sessionNumber}`, csrfToken: `csrf_session_${sessionNumber}` });
      }

      if (url === "/read") {
        readNumber += 1;
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer mgmt_session_${readNumber}`);
        return readNumber === 1
          ? jsonResponse({ message: "Management session is unauthorized." }, { status: 401 })
          : jsonResponse({ ok: true });
      }

      throw new Error("Unexpected request " + url);
    });
    const client = createManagementHttpClient({ fetch: fetcher });

    await expect(client.getJson("/read", "Unable to read.")).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/read")).toHaveLength(2);
  });

  it("sends raw bodies with protected management headers and retries once after a 401", async () => {
    const body = new Uint8Array([4, 5, 6]).buffer;
    let sessionNumber = 0;
    let requestNumber = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        sessionNumber += 1;
        return jsonResponse({ id: `mgmt_session_${sessionNumber}`, csrfToken: `csrf_session_${sessionNumber}` });
      }

      if (url === "/assets/import") {
        requestNumber += 1;
        const headers = new Headers(init?.headers);
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(body);
        expect(headers.get("authorization")).toBe(`Bearer mgmt_session_${requestNumber}`);
        expect(headers.get("x-stream-jams-csrf")).toBe(`csrf_session_${requestNumber}`);
        expect(headers.get("content-type")).toBe("application/octet-stream");
        expect(headers.get("x-stream-jams-file-name")).toBe("sample.png");
        return requestNumber === 1
          ? jsonResponse({ error: { code: "MANAGEMENT_SESSION_UNAUTHORIZED", message: "Expired." } }, { status: 401 })
          : new Response(null, { status: 204 });
      }

      throw new Error("Unexpected request " + url);
    });
    const client = createManagementHttpClient({ fetch: fetcher });

    await expect(client.request("/assets/import", {
      method: "POST",
      headers: {
        authorization: "Bearer caller-must-not-control-this",
        "content-type": "application/octet-stream",
        "x-stream-jams-csrf": "caller-must-not-control-this",
        "x-stream-jams-file-name": "sample.png"
      },
      body,
      fallbackMessage: "Unable to import asset."
    })).resolves.toBeInstanceOf(Response);
    expect(sessionNumber).toBe(2);
    expect(requestNumber).toBe(2);
  });

  it("retains structured error details for raw requests", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" })
        : jsonResponse({
            error: {
              code: "ASSET_REPLACE_REFERENCED",
              id: "err_asset_1",
              message: "The asset is still referenced.",
              nextStep: "Confirm the affected uses before replacing it."
            }
          }, { status: 409 })
    );
    const client = createManagementHttpClient({ fetch: fetcher });

    const error = await client.request("/assets/asset_1/replace", {
      method: "POST",
      fallbackMessage: "Unable to replace asset."
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ManagementHttpError);
    expect(error).toMatchObject({
      code: "ASSET_REPLACE_REFERENCED",
      referenceId: "err_asset_1",
      nextStep: "Confirm the affected uses before replacing it.",
      status: 409
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

it("stops after one renewal when the replacement management session is also unauthorized", async () => {
  let sessions = 0; let reads = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/auth/management/sessions") {
      sessions++;
      return jsonResponse({ id: `session_${sessions}`, csrfToken: `csrf_${sessions}` });
    }
    reads++;
    return jsonResponse({ error: { code: "MANAGEMENT_SESSION_UNAUTHORIZED", message: "Expired." } }, { status: 401 });
  });
  const client = createManagementHttpClient({ fetch: fetcher });
  await expect(client.getJson("/read", "Unable to read.")).rejects.toThrow("Expired.");
  expect(sessions).toBe(2); expect(reads).toBe(2);
});
