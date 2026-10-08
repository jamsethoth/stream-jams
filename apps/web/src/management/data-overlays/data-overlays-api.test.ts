import { describe, expect, it, vi } from "vitest";
import { createHttpDataOverlaysApi } from "./data-overlays-api.js";
import { ManagementHttpError } from "../management-http-client.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";

describe("Data management HTTP boundary", () => {
  it("sends authenticated definition patches, never a live command, and accepts full state", async () => {
    const state = dataPreviewFixture();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : state), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createHttpDataOverlaysApi({ fetch: fetcher });
    expect(await api.updateValue("counter", { name: "Deaths" })).toEqual(state);
    const [, request] = fetcher.mock.calls.find(([path]) => path === "/data-overlays/values/counter") as unknown as [string, RequestInit];
    expect(request.method).toBe("PATCH");
    expect(new Headers(request.headers).get("x-stream-jams-csrf")).toBe("csrf");
    expect(JSON.parse(request.body as string)).toEqual({ name: "Deaths" });
  });
  it("preserves domain reference strings and fresh current value without retrying failed mutation", async () => {
    const currentValue = dataPreviewFixture().values[0];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input) === "/auth/management/sessions" ? { id: "session", csrfToken: "csrf" } : { error: { code: "DATA_REVISION_CONFLICT", message: "Value changed", references: ["goal:goal"], currentValue } }), { status: String(input) === "/auth/management/sessions" ? 200 : 409, headers: { "content-type": "application/json" } }));
    const api = createHttpDataOverlaysApi({ fetch: fetcher });
    const result = await api.deleteValue("counter").catch((cause: unknown) => cause);
    expect(result).toBeInstanceOf(ManagementHttpError);
    expect(result).toMatchObject({ code: "DATA_REVISION_CONFLICT", dataReferences: ["goal:goal"], currentValue });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
