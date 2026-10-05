import { describe, expect, it } from "vitest";
import { createDefaultMusicModuleConfig } from "./schemas.js";
import { collectMusicAssetReferences } from "./asset-references.js";

describe("collectMusicAssetReferences", () => {
  it("enumerates branding and both font roles in all four profile/view pairs, including hidden compact views", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.initialView = "full";
    config.profiles.vertical.initialView = "full";
    for (const profile of ["landscape", "vertical"] as const) {
      for (const view of ["full", "compact"] as const) {
        const appearance = config.profiles[profile].views[view];
        appearance.branding.assetId = "shared-brand";
        appearance.titleFont.fontAssetId = `${profile}-${view}-title`;
        appearance.detailsFont.fontAssetId = `${profile}-${view}-details`;
      }
    }

    const references = collectMusicAssetReferences(config);
    expect(references).toHaveLength(12);
    for (const profile of ["landscape", "vertical"] as const) {
      for (const view of ["full", "compact"] as const) {
        expect(references).toEqual(expect.arrayContaining([
          { assetId: "shared-brand", moduleId: "music", ownerId: profile, ownerName: `Music ${profile}`, variantId: view, usageRole: "branding" },
          { assetId: `${profile}-${view}-title`, moduleId: "music", ownerId: profile, ownerName: `Music ${profile}`, variantId: view, usageRole: "title-font" },
          { assetId: `${profile}-${view}-details`, moduleId: "music", ownerId: profile, ownerName: `Music ${profile}`, variantId: view, usageRole: "details-font" }
        ]));
      }
    }
    expect(collectMusicAssetReferences(createDefaultMusicModuleConfig())).toEqual([]);
  });
});
