import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { OverlayComposition, OverlayInstruction, VisualRecipientKey } from "@stream-jams/core";
import { OverlaySurface, type OverlayPlaybackEvent } from "../overlay/components/OverlaySurface.js";
import type { DesktopOverlayController } from "./desktop-overlay-controller.js";

function scopedId(key: VisualRecipientKey, id: string): string {
  return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation, id]);
}

export function DesktopOverlayApp({ controller, subscribe }: {
  readonly controller: DesktopOverlayController;
  readonly subscribe: (listener: () => void) => () => void;
}) {
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const composition = useMemo<OverlayComposition>(() => ({
    overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape",
    modules: snapshot.config.layers.map((layer, index) => ({
      moduleId: layer.moduleId, enabled: true,
      surfaceLayer: { visible: layer.visible, zIndex: snapshot.config.layers.length - index },
      instructions: snapshot.occurrences.filter(occurrence => occurrence.key.moduleId === layer.moduleId).flatMap(occurrence =>
        occurrence.instructions.map((instruction): OverlayInstruction => ({ ...instruction,
          id: scopedId(occurrence.key, instruction.id), timing: occurrence.timing,
          visual: instruction.visual === null ? null : { ...instruction.visual, assetId: scopedId(occurrence.key, instruction.visual.assetId) }
        })))
    }))
  }), [snapshot]);
  const resolveAssetUrl = useCallback((id: string) => {
    for (const occurrence of controller.getSnapshot().occurrences) {
      for (const [assetId, url] of occurrence.assetUrls) if (scopedId(occurrence.key, assetId) === id) return url;
    }
    return "";
  }, [controller]);
  const onPlaybackEvent = useCallback((event: OverlayPlaybackEvent) => {
    if (event.status !== "failed") return;
    const occurrence = controller.getSnapshot().occurrences.find(value => value.instructions.some(instruction => scopedId(value.key, instruction.id) === event.instructionId));
    if (occurrence !== undefined) controller.fail(occurrence.key);
  }, [controller]);
  return <OverlaySurface composition={composition} muted resolveAssetUrl={resolveAssetUrl} onPlaybackEvent={onPlaybackEvent} />;
}
