import type {
  AssetRepository,
  AudioOutputRouteRepository,
  EffectContentSnapshot
} from "@stream-jams/core";
import type { OutputReadinessService } from "../overlays/output-readiness-service.js";

export interface EffectPlaybackEligibilityServiceOptions {
  readonly assets: Pick<AssetRepository, "findManyByIds">;
  readonly routes: Pick<AudioOutputRouteRepository, "findById">;
  readonly outputs: Pick<
    OutputReadinessService,
    "isBrowserOutputReady" | "isDesktopVisualReady" | "hasReadyAudioRoute"
  >;
}

export class EffectPlaybackEligibilityService {
  constructor(private readonly options: EffectPlaybackEligibilityServiceOptions) {}

  async referencesExist(content: EffectContentSnapshot): Promise<boolean> {
    const assetIds = [
      ...(content.variant.visual === null ? [] : [content.variant.visual.assetId]),
      ...(content.variant.sound === null ? [] : [content.variant.sound.assetId])
    ];
    const assets = await this.options.assets.findManyByIds(assetIds);
    const visual = content.variant.visual;
    if (visual !== null && assets.get(visual.assetId)?.mediaType !== visual.mediaType) return false;
    const sound = content.variant.sound;
    if (sound !== null && assets.get(sound.assetId)?.mediaType !== "audio") return false;
    return content.variant.outputs.deviceRouteIds.every(
      (routeId) => this.options.routes.findById(routeId) !== null
    );
  }

  async hasAvailableOutput(content: EffectContentSnapshot): Promise<boolean> {
    const { variant } = content;
    const hasBrowserVisual = variant.visual !== null && variant.visualOutputs.browserSource;
    const hasAudioSource = variant.sound !== null
      || (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio);
    const hasBrowserAudio = hasAudioSource && variant.outputs.browserSource;
    const browserReady = hasBrowserVisual || hasBrowserAudio
      ? await this.options.outputs.isBrowserOutputReady({
          moduleId: "screen-effects",
          hasVisual: hasBrowserVisual,
          hasAudio: hasBrowserAudio,
          targetProfileId: null
        })
      : false;
    if (browserReady) return true;

    const desktopReady = variant.visual !== null && variant.visualOutputs.desktop
      ? await this.options.outputs.isDesktopVisualReady("screen-effects")
      : false;
    if (desktopReady) return true;

    return hasAudioSource && variant.outputs.deviceRouteIds.length > 0
      ? this.options.outputs.hasReadyAudioRoute(variant.outputs.deviceRouteIds)
      : false;
  }
}
