import { expect, it, vi } from "vitest";
import { createHttpMediaPreviewApi } from "./media-preview-api.js";

it("uses authenticated CSRF mutations for create, renew and release, never bearer query credentials", async () => {
  const descriptor = { id: "00000000-0000-4000-8000-000000000001", url: `/media/med_${"a".repeat(43)}`,
    snapshot: { assetId: "asset", version: "a".repeat(64), mimeType: "video/mp4", sizeBytes: 60000000, durationMs: 2000 }, expiresAt: Date.now() + 300000 };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/auth/management/sessions") return Response.json({ id: "session", csrfToken: "csrf" });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer session");
    expect(new Headers(init?.headers).get("x-stream-jams-csrf")).toBe("csrf");
    expect(String(input)).not.toContain("?");
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(descriptor);
  });
  const api = createHttpMediaPreviewApi({ fetch: fetcher });
  expect(await api.createPreview("asset")).toEqual(descriptor);
  expect(await api.renewPreview(descriptor.id)).toEqual(descriptor);
  await api.releasePreview(descriptor.id);
  expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual(["/auth/management/sessions", "/assets/asset/preview",
    `/assets/previews/${descriptor.id}/renew`, `/assets/previews/${descriptor.id}`]);
});
it("rejects a foreign media URL without exposing its capability in the error", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input) === "/auth/management/sessions"
    ? Response.json({ id: "session", csrfToken: "csrf" })
    : Response.json({ id: "00000000-0000-4000-8000-000000000001", url: "https://foreign.example/secret", snapshot: {}, expiresAt: 1 }));
  await expect(createHttpMediaPreviewApi({ fetch: fetcher }).createPreview("asset")).rejects.toThrow("Media preview response is invalid");
});
