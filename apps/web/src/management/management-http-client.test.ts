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
          method: "DELETE"
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({ deleted: true });
      }

      throw new Error("Unexpected request " + url);
    });
    const client = createManagementHttpClient({ fetch: fetcher });

    await expect(client.getJson("/read", "Unable to read.")).resolves.toEqual({ ok: true });
    await expect(client.postJson("/write", { value: 1 }, "Unable to write.")).resolves.toEqual({ saved: true });
    await expect(client.deleteJson("/deleted", "Unable to delete.")).resolves.toEqual({ deleted: true });
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
