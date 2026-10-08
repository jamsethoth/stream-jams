import { describe, expect, it, vi } from "vitest";
import { createHttpDataTemplateApi } from "./data-template-api.js";
import { dataTemplateFixture } from "./data-template-fixtures.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { ManagementHttpError } from "../management-http-client.js";
describe("Template HTTP boundary", () => {
  it("validates inputs and uses one authenticated atomic create route", async () => {
    const responder = async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : dataPreviewFixture()), { status: 200, headers: { "content-type": "application/json" } });
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => { void init; return responder(input); });
    const api = createHttpDataTemplateApi({ fetch: fetcher });
    await api.instantiate("goal-bar", { name: "Goal", enabled: false, order: 0, outputs: { browser: true, desktop: false }, mappings: [] });
    const requests = fetcher.mock.calls.filter(([path]) => String(path).startsWith("/data-overlays")); expect(requests).toHaveLength(1);
    expect(requests[0]![0]).toBe("/data-overlays/templates/goal-bar/instantiate"); expect(new Headers(requests[0]![1]?.headers).get("x-stream-jams-csrf")).toBe("csrf");
  });
  it("validates catalog responses and keeps provider readiness errors without retrying", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : String(input).endsWith("/templates") ? { templates: [dataTemplateFixture()] } : { error: { code: "DATA_SOURCE_NOT_READY", message: "Reconnect Twitch follower source." } }), { status: String(input).endsWith("/insert") ? 409 : 200, headers: { "content-type": "application/json" } }));
    const api = createHttpDataTemplateApi({ fetch: fetcher }); expect((await api.getCatalog()).templates).toHaveLength(1);
    const error = await api.insert("source", { canvasId: "canvas", x: 0, y: 0, mappings: [] }).catch((cause: unknown) => cause); expect(error).toBeInstanceOf(ManagementHttpError); expect(error).toMatchObject({ code: "DATA_SOURCE_NOT_READY" });
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/insert"))).toHaveLength(1);
  });
});
