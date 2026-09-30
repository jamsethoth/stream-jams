import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { OverlayComposition, OverlayInstruction, VisualRecipientKey } from "@stream-jams/core";
import { OverlaySurface, type OverlayPlaybackEvent } from "../overlay/components/OverlaySurface.js";
import type { DesktopOverlayController } from "./desktop-overlay-controller.js";

function scopedId(key: VisualRecipientKey, id: string): string {
  return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation, id]);
}
function scopedModuleAssetId(moduleId: string, revision: number, id: string): string {
  return JSON.stringify(["module", moduleId, revision, id]);
}

export function DesktopOverlayApp({ controller, subscribe }: {
  readonly controller: DesktopOverlayController;
  readonly subscribe: (listener: () => void) => () => void;
}) {
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const composition = useMemo<OverlayComposition>(() => ({
    overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape",
    modules: snapshot.config.layers.map((layer, index) => {
      const persistent = snapshot.modules.find(module => module.moduleId === layer.moduleId);
      return {
        moduleId: layer.moduleId, enabled: true,
        surfaceLayer: { visible: layer.visible, zIndex: snapshot.config.layers.length - index },
        instructions: snapshot.occurrences.filter(occurrence => occurrence.key.moduleId === layer.moduleId).flatMap(occurrence =>
          occurrence.instructions.map((instruction): OverlayInstruction => ({ ...instruction,
            id: scopedId(occurrence.key, instruction.id), timing: occurrence.timing,
            visual: instruction.visual === null ? null : { ...instruction.visual, assetId: scopedId(occurrence.key, instruction.visual.assetId) }
          }))),
        ...(persistent === undefined ? {} : { presentation: { ...persistent.presentation, stack: {
          ...persistent.presentation.stack,
          cards: persistent.presentation.stack.cards.map(card => ({ ...card, iconAssetId: card.iconAssetId === null ? null :
            scopedModuleAssetId(persistent.moduleId, persistent.revision, card.iconAssetId) }))
        } } })
      };
    })
  }), [snapshot]);
  const resolveAssetUrl = useCallback((id: string) => {
    for (const occurrence of controller.getSnapshot().occurrences) {
      for (const [assetId, url] of occurrence.assetUrls) if (scopedId(occurrence.key, assetId) === id) return url;
    }
    for (const module of controller.getSnapshot().modules) {
      for (const [assetId, url] of module.assetUrls) if (scopedModuleAssetId(module.moduleId, module.revision, assetId) === id) return url;
    }
    return "";
  }, [controller]);
  const onPlaybackEvent = useCallback((event: OverlayPlaybackEvent) => {
    const occurrence = controller.getSnapshot().occurrences.find(value => value.instructions.some(instruction => scopedId(value.key, instruction.id) === event.instructionId));
    if (occurrence === undefined) return;
    if (event.status === "failed") controller.fail(occurrence.key, event.failure);
    if (event.status === "ready" || event.status === "completed") {
      const instruction = occurrence.instructions.find(value => scopedId(occurrence.key, value.id) === event.instructionId)!;
      if (event.status === "ready") controller.ready(occurrence.key, instruction.id);
      else controller.complete(occurrence.key, instruction.id);
    }
  }, [controller]);
  const preparingInstructionIds = useMemo(() => new Set(snapshot.occurrences.filter(occurrence => occurrence.preparing === true)
    .flatMap(occurrence => occurrence.instructions.map(instruction => scopedId(occurrence.key, instruction.id)))), [snapshot]);
  return <OverlaySurface composition={composition} muted preparingInstructionIds={preparingInstructionIds} resolveAssetUrl={resolveAssetUrl} onPlaybackEvent={onPlaybackEvent} />;
}
