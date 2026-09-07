import { describe, expect, it, vi } from "vitest";
import { createHttpAudioApi } from "./audio-api.js";

describe("createHttpAudioApi", () => {
  it("validates status responses and sends protected route mutations", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_audio", csrfToken: "csrf_audio" });
      }
      if (url === "/audio/status") return jsonResponse(statusResponse());
      if (url === "/audio/routes") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify({ name: "Headphones", deviceId: "endpoint-a" })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_audio",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_audio"
        });
        return jsonResponse(routeResponse(), { status: 201 });
      }
      if (url === "/audio/routes/route-a") {
        if (init?.method === "PATCH") {
          expect(init.body).toBe(JSON.stringify({ name: "Private mix", confirmLiveImpact: false }));
          return jsonResponse({ ...routeResponse(), name: "Private mix" });
        }
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }
      if (url === "/audio/routes/route-a/test") {
        expect(init).toMatchObject({ method: "POST" });
        return jsonResponse({ routeId: "route-a", muted: true });
      }
      if (url === "/audio/retry") {
        expect(init).toMatchObject({ method: "POST" });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const api = createHttpAudioApi({ fetch: fetcher });

    await expect(api.getStatus()).resolves.toEqual(statusResponse());
    await expect(api.createRoute({ name: "Headphones", deviceId: "endpoint-a" })).resolves.toEqual(routeResponse());
    await expect(api.updateRoute("route-a", { name: "Private mix" })).resolves.toMatchObject({ name: "Private mix" });
    await expect(api.testRoute("route-a")).resolves.toEqual({ routeId: "route-a", muted: true });
    await expect(api.deleteRoute("route-a")).resolves.toBeUndefined();
    await expect(api.retry()).resolves.toBeUndefined();
  });

  it("rejects invalid requests and malformed responses at the typed boundary", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_audio", csrfToken: "csrf_audio" })
        : jsonResponse({ muted: false, routes: [] })
    );
    const api = createHttpAudioApi({ fetch: fetcher });

    await expect(api.createRoute({ name: "", deviceId: "default" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(api.getStatus()).rejects.toThrow();
  });
});

function routeResponse() {
  return { id: "route-a", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headphones" };
}

function statusResponse() {
  return {
    capability: { available: true, devices: [{ deviceId: "endpoint-a", label: "USB headphones" }], reason: null, nextStep: null },
    muted: true,
    routes: [{ route: routeResponse(), state: "ready" as const }]
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}
