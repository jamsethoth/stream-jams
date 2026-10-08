import { expect, it, vi } from "vitest";
import { createHttpTwitchDataSourcesApi } from "./twitch-data-sources-api.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { twitchDataStatus } from "./twitch-data-source-fixtures.js";
it("validates status and sends only an explicit name with session and CSRF", async () => {
  const fetcher = vi.fn<(path: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async path => new Response(JSON.stringify(String(path) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : String(path) === "/data-overlays/sources/twitch" ? twitchDataStatus() : dataPreviewFixture()), { headers: { "content-type": "application/json" } }));
  const api = createHttpTwitchDataSourcesApi({ fetch: fetcher });
  expect(await api.getStatus()).toEqual(twitchDataStatus());
  await api.createFollowers({ name: "Followers" });
  const [, request] = fetcher.mock.calls.find(([path]) => path === "/data-overlays/sources/twitch/followers")!;
  expect(request?.method).toBe("POST"); expect(new Headers(request?.headers).get("x-stream-jams-csrf")).toBe("csrf");
  expect(JSON.parse(request!.body as string)).toEqual({ name: "Followers" });
});
it("rejects fabricated ready-goal status and forged ownership before sending", async () => {
  const fetcher = vi.fn(async (path: RequestInfo | URL) => new Response(JSON.stringify(String(path) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : { ...twitchDataStatus(), goals: { state: "ready", missingScopes: [] } }), { headers: { "content-type": "application/json" } }));
  const api = createHttpTwitchDataSourcesApi({ fetch: fetcher });
  await expect(api.getStatus()).rejects.toThrow(); fetcher.mockClear();
  await expect(api.createFollowers({ name: "Followers", broadcasterId: "forged" } as { name: string })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
