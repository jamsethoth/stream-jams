import type { ModuleMediaReference } from "../audio/types.js";
import type { MusicModuleConfig } from "./types.js";

export interface MusicAssetReference extends ModuleMediaReference {
  readonly assetId: string;
  readonly moduleId: "music";
  readonly ownerId: "landscape" | "vertical";
  readonly variantId: "full" | "compact";
  readonly usageRole: "branding" | "title-font" | "details-font";
}

export function collectMusicAssetReferences(config: MusicModuleConfig): readonly MusicAssetReference[] {
  const references: MusicAssetReference[] = [];
  for (const profile of ["landscape", "vertical"] as const) {
    for (const view of ["full", "compact"] as const) {
      const appearance = config.profiles[profile].views[view];
      const base = { moduleId: "music", ownerId: profile, ownerName: `Music ${profile}`, variantId: view } as const;
      if (appearance.branding.assetId !== null) references.push({ ...base, assetId: appearance.branding.assetId, usageRole: "branding" });
      if (appearance.titleFont.fontAssetId !== null) references.push({ ...base, assetId: appearance.titleFont.fontAssetId, usageRole: "title-font" });
      if (appearance.detailsFont.fontAssetId !== null) references.push({ ...base, assetId: appearance.detailsFont.fontAssetId, usageRole: "details-font" });
    }
  }
  return references;
}
