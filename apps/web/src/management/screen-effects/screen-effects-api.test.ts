import { createScreenEffectDocument, screenEffectDocumentSchema } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createHttpScreenEffectsApi } from "./screen-effects-api.js";

const document = screenEffectDocumentSchema.parse({
  ...createScreenEffectDocument({ id: "effect-one", name: "Effect one", defaultVariantId: "variant-one" }),
  variants: [{
    ...createScreenEffectDocument({ id: "unused", name: "Unused", defaultVariantId: "variant-one" }).variants[0],
    sound: { assetId: "tone-one", volume: 0.5 },
    outputs: { browserSource: true, deviceRouteIds: [] }
  }]
});

describe("createHttpScreenEffectsApi", () => {
  it("validates documents and sends protected complete mutations", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return json({ id: "mgmt-effects", csrfToken: "csrf-effects" });
      if (url === "/management/overlay-outputs") return json([{
        id: "module:screen-effects:live",
        label: "Screen Effects",
        purpose: "live",
        scope: "module",
        moduleId: "screen-effects",
        enabled: true,
        copyableUrlStatus: "available"
      }]);
      expect(init?.headers).toMatchObject({ authorization: "Bearer mgmt-effects" });
      if (init?.method !== undefined) expect(init.headers).toMatchObject({ "x-stream-jams-csrf": "csrf-effects" });
      if (url.endsWith("/test")) return json({ effectId: "effect-one", status: "queued", occurrenceId: "occurrence-one" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return json(url === "/screen-effects" && init?.method === undefined ? [document] : document, init?.method === "POST" ? 201 : 200);
    });
    const api = createHttpScreenEffectsApi({ fetch: fetcher });

    await expect(api.list()).resolves.toEqual([document]);
    await expect(api.listBrowserSources()).resolves.toEqual([{
      id: "module:screen-effects:live",
      label: "Screen Effects",
      purpose: "live",
      enabled: true,
      status: "available"
    }]);
    await expect(api.get("effect/one")).resolves.toEqual(document);
    await expect(api.create(document)).resolves.toEqual(document);
    await expect(api.update(document.id, document, true)).resolves.toEqual(document);
    await expect(api.test(document.id, "variant-one", true)).resolves.toMatchObject({ status: "queued" });
    await expect(api.remove(document.id)).resolves.toBeUndefined();

    expect(fetcher.mock.calls.map((call) => String(call[0]))).toContain("/screen-effects/effect%2Fone");
  });

  it("rejects malformed server documents", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => String(input) === "/auth/management/sessions"
      ? json({ id: "mgmt-effects", csrfToken: "csrf-effects" })
      : json([{ id: "incomplete" }]));

    await expect(createHttpScreenEffectsApi({ fetch: fetcher }).list()).rejects.toThrow();
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
