import { expect, it, vi } from "vitest";
import { createHttpSurfaceSettingsApi } from "./overlay-surfaces-api.js";
const view = { surfaces: [], desktop: { available: false, displays: [], state: "unavailable", message: "Use Windows desktop." } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
it("uses protected requests, encoded complete surface identity, and an empty retry", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input); if (url === "/auth/management/sessions") return json({ id: "mgmt_test", csrfToken: "csrf_test" });
    expect(init?.headers).toMatchObject({ authorization: "Bearer mgmt_test" });
    if (init?.method !== undefined) expect(init.headers).toMatchObject({ "x-stream-jams-csrf": "csrf_test" });
    if (url === "/overlay-surfaces/unified-browser%3Aspace%2Fone") expect(init).toMatchObject({ method: "PUT", body: JSON.stringify({ id: "unified-browser:space/one", kind: "unified-browser", overlayId: "space/one", layers: [] }) });
    if (url === "/overlay-surfaces/desktop/retry") { expect(init?.method).toBe("POST"); expect(init?.body).toBeUndefined(); }
    return json(view);
  });
  const api = createHttpSurfaceSettingsApi({ fetch: fetcher }); expect(await api.load()).toEqual(view);
  expect(await api.save({ id: "unified-browser:space/one", kind: "unified-browser", overlayId: "space/one", layers: [] })).toEqual(view);
  expect(await api.retry()).toEqual(view);
  expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual(["/auth/management/sessions", "/overlay-surfaces", "/overlay-surfaces/unified-browser%3Aspace%2Fone", "/overlay-surfaces/desktop/retry"]);
});
it("rejects invalid drafts before network access and malformed responses", async () => {
  const fetcher = vi.fn<typeof fetch>(async input => String(input) === "/auth/management/sessions" ? json({ id: "mgmt_test", csrfToken: "csrf_test" }) : json({ ...view, token: "unexpected" }));
  const api = createHttpSurfaceSettingsApi({ fetch: fetcher });
  await expect(api.save({ id: "desktop:primary", kind: "desktop", enabled: true, displayId: null, opacity: 1, layers: [] })).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  await expect(api.load()).rejects.toThrow();
});
