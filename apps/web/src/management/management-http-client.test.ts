import { describe, expect, it, vi } from "vitest";
import { createManagementHttpClient } from "./management-http-client.js";

describe("createManagementHttpClient", () => {
  it("reuses the management session and sends CSRF headers for mutating JSON requests", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session", csrfToken: "csrf_session" });
      }

      if (url === "/read") {
        expect(init?.method).toBeUndefined();
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        expect(init?.headers).not.toMatchObject({
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({ ok: true });
      }

      if (url === "/write") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify({ value: 1 })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({ saved: true });
      }

      if (url === "/deleted") {
        expect(init).toMatchObject({
          method: "DELETE",
          body: JSON.stringify({ confirm: true })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
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
        expect(init?.headers).toMatchObject({
          authorization: `Bearer mgmt_session_${readNumber}`
        });
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
