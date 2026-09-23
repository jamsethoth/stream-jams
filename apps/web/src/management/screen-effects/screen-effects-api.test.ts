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
        overlayId: "default",
        scope: "module",
        moduleId: "screen-effects",
        targetProfileId: null,
        enabled: true,
        keyId: "key-one",
        url: "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_secret",
        copyableUrlStatus: "available"
      }]);
      if (url === "/overlay-modules/screen-effects/config") return json({
        moduleId: "screen-effects", enabled: true, config: {}, updatedAt: "2026-09-13T12:00:00.000Z"
      });
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer mgmt-effects");
      if (init?.method !== undefined) expect(headers.get("x-stream-jams-csrf")).toBe("csrf-effects");
      if (url === "/overlay-modules/screen-effects/enabled") return json({
        moduleId: "screen-effects", enabled: true, config: {}, updatedAt: "2026-09-13T12:00:00.000Z"
      });
      if (url.startsWith("/management/overlay-outputs/keys")) return json({ output: {
        id: "module:screen-effects:live",
        label: "Screen Effects",
        purpose: "live",
        overlayId: "default",
        scope: "module",
        moduleId: "screen-effects",
        targetProfileId: null,
        enabled: true,
        keyId: "key-two",
        url: "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_replaced",
        copyableUrlStatus: "available"
      } });
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
      overlayId: "default",
      scope: "module",
      moduleId: "screen-effects",
      targetProfileId: null,
      enabled: true,
      keyId: "key-one",
      url: "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_secret",
      status: "available"
    }]);
    await expect(api.getModuleEnabled()).resolves.toBe(true);
    await expect(api.setModuleEnabled(true)).resolves.toBe(true);
    const source = (await api.listBrowserSources())[0]!;
    await expect(api.createBrowserSource(source)).resolves.toMatchObject({ keyId: "key-two" });
    await expect(api.regenerateBrowserSource(source)).resolves.toMatchObject({ keyId: "key-two" });
    await expect(api.get("effect/one")).resolves.toEqual(document);
    await expect(api.create(document)).resolves.toEqual(document);
    await expect(api.update(document.id, document, true)).resolves.toEqual(document);
    await expect(api.test(document.id, "variant-one", true)).resolves.toMatchObject({ status: "queued" });
    await expect(api.remove(document.id)).resolves.toBeUndefined();

    expect(fetcher.mock.calls.map((call) => String(call[0]))).toContain("/screen-effects/effect%2Fone");
    const outputMutations = fetcher.mock.calls.filter((call) => String(call[0]).startsWith("/management/overlay-outputs/keys"));
    expect(outputMutations.map((call) => JSON.parse(String(call[1]?.body)))).toEqual([
      { overlayId: "default", scope: "module", moduleId: "screen-effects", purpose: "live", targetProfileId: null },
      { overlayId: "default", scope: "module", moduleId: "screen-effects", purpose: "live", targetProfileId: null }
    ]);
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
