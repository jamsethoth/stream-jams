import { createScreenEffectDocument, screenEffectDocumentSchema } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";
import { readFile } from "node:fs/promises";

// Real management sessions stay out of artifacts; all data belongs to this disposable runtime.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("live runtime maps missing effects and unavailable references and remains operable", async ({ page }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const missing = await fixture.request("/screen-effects/missing-effect");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "SCREEN_EFFECT_NOT_FOUND", message: 'Screen Effect "missing-effect" was not found' } });
    const imported = await fetch(`${fixture.runtime.url}/assets/import`, {
      method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "disposable.png", "x-stream-jams-mime-type": "image/png" },
      body: await readFile("apps/web/public/storybook-assets/tiny-image.png")
    });
    expect(imported.status).toBe(201);
    const asset = await imported.json() as { id: string };
    const visual = { assetId: asset.id, mediaType: "image" as const, layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } };

    for (const kind of ["visual", "sound", "route"] as const) {
      const draft = createScreenEffectDocument({ id: `effect-${kind}`, name: "Disposable effect", defaultVariantId: `variant-${kind}` });
      const variant = draft.variants[0]!;
      const document = screenEffectDocumentSchema.parse({ ...draft, variants: [{ ...variant,
        visual: kind === "visual" ? { ...visual, assetId: "missing-reference" } : visual,
        ...(kind === "sound" ? { sound: { assetId: "missing-reference", volume: 0.5 } } : {}),
        ...(kind === "route" ? { outputs: { ...variant.outputs, deviceRouteIds: ["missing-reference"] } } : {})
      }] });
      const response = await fixture.request("/screen-effects", "POST", document);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "SCREEN_EFFECT_REFERENCE_UNAVAILABLE" } });
      const persisted = await fixture.request(`/screen-effects/effect-${kind}`);
      expect(persisted.status).toBe(404);
    }

    const healthyDraft = createScreenEffectDocument({ id: "effect-valid", name: "Valid disposable effect", defaultVariantId: "variant-valid" });
    const healthy = screenEffectDocumentSchema.parse({ ...healthyDraft, variants: [{ ...healthyDraft.variants[0]!, visual }] });
    expect((await fixture.request("/screen-effects", "POST", healthy)).status).toBe(201);
    expect((await fixture.request("/screen-effects/effect-valid")).status).toBe(200);
    await page.goto(`${fixture.runtime.url}/manage/modules/screen-effects`);
    await expect(page.getByRole("region", { name: "Screen Effects content" }).getByRole("heading", { name: "Screen Effects", exact: true })).toBeVisible();
    await expect(page.getByText("Valid disposable effect", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Valid disposable effect", { exact: true })).toBeVisible();
  } finally { await fixture.close(); }
});
