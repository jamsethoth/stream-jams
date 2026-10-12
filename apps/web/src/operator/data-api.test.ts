import { expect, it, vi } from "vitest";
import { dataPreviewFixture } from "../management/data-overlays/data-preview-fixtures.js";
import { createHttpOperatorDataApi } from "./data-api.js";
it("uses management session and CSRF for exact Operator command routes with full-state validation", async () => {
  const fetcher = vi.fn<typeof fetch>(async input => json(String(input) === "/auth/management/sessions" ? { id: "fixture-session", csrfToken: "fixture-csrf" } : dataPreviewFixture()));
  const api = createHttpOperatorDataApi({ fetch: fetcher });
  await api.getState(); await api.delta("counter", "add"); await api.delta("counter", "subtract"); await api.setValue("counter", { content: 5, expectedRevision: 0 }); await api.resetValue("counter"); await api.resetGroup("session"); await api.restartGoal("goal"); await api.setVisibility("canvas", false);
  expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual(["/auth/management/sessions", "/operator/data-overlays", "/operator/data-overlays/values/counter/add", "/operator/data-overlays/values/counter/subtract", "/operator/data-overlays/values/counter/set", "/operator/data-overlays/values/counter/reset", "/operator/data-overlays/groups/session/reset", "/operator/data-overlays/goals/goal/restart", "/operator/data-overlays/canvases/canvas/visibility"]);
  const set = fetcher.mock.calls.find(call => String(call[0]).endsWith("/set"))![1]!;
  expect(JSON.parse(String(set.body))).toEqual({ content: 5, expectedRevision: 0 });
  expect(new Headers(set.headers).get("x-stream-jams-csrf")).toBe("fixture-csrf");
  expect(new Headers(set.headers).get("authorization")).toBe("Bearer fixture-session");
});
it("rejects malformed response and unsafe correction before mutation", async () => {
  const fetcher = vi.fn<typeof fetch>(async input => json(String(input) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : { values: [] }));
  const api = createHttpOperatorDataApi({ fetch: fetcher });
  await expect(api.getState()).rejects.toThrow();
  expect(() => api.setValue("counter", { content: Number.MAX_SAFE_INTEGER + 1, expectedRevision: 0 })).toThrow();
});
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
