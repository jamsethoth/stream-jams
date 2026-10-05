import { InvalidOverlayModuleConfigError, musicModuleConfigSchema, type OverlayModuleConfigService, type SaveOverlayModuleConfigInput } from "@stream-jams/core";
import { validateMusicCss } from "@stream-jams/core/music-style-policy";

/** Apply the browser-compatible CSS policy before the repository can mutate durable Music config. */
export async function saveValidatedMusicConfig(service: Pick<OverlayModuleConfigService, "getModuleConfig" | "saveModuleConfig">, input: SaveOverlayModuleConfigInput) {
  if (input.moduleId !== "music") return service.saveModuleConfig(input);
  const parsed = musicModuleConfigSchema.safeParse(input.config);
  if (!parsed.success) throw new InvalidOverlayModuleConfigError("music");
  const { css } = parsed.data;
  const result = validateMusicCss(css.source, css.styleContractVersion);
  if (!result.valid) {
    // Recovery for a previously persisted corrupt sheet: the only accepted mutation is
    // turning that exact sheet off. All other edits, including module enablement, wait
    // until the stylesheet is fixed or explicitly cleared through a valid save.
    const current = await service.getModuleConfig("music");
    const previous = musicModuleConfigSchema.safeParse(current.config);
    const permitted = previous.success && previous.data.css.enabled && !css.enabled
      && current.enabled === input.enabled
      && JSON.stringify({ ...previous.data, css: { ...previous.data.css, enabled: false } }) === JSON.stringify(parsed.data);
    if (!permitted) throw new InvalidOverlayModuleConfigError("music");
  }
  return service.saveModuleConfig({ ...input, config: parsed.data });
}
