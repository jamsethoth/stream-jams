import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OverlayComposition,
  OverlayInstruction,
  OverlayModuleSnapshot
} from "@stream-jams/core";
import {
  connectOverlayClient,
  createOverlayAssetUrl,
  parseOverlayRoute,
  type OverlayClientConnection,
  type OverlayClientMessage
} from "./overlay-client.js";
import { OverlaySurface, overlayRootStyle, type OverlayPlaybackEvent } from "./components/OverlaySurface.js";

export { OverlaySurface } from "./components/OverlaySurface.js";

const maximumPendingOverlayMutations = 100;

export function OverlayApp() {
  const route = useMemo(() => parseOverlayRoute(`${window.location.pathname}${window.location.search}`), []);
  const [composition, setComposition] = useState<OverlayComposition | null>(null);
  const [preparingIds, setPreparingIds] = useState<ReadonlySet<string>>(new Set());
  const seenIdsRef = useRef(new Set<string>());
  const preparedIdsRef = useRef(new Set<string>());
  const [muted, setMuted] = useState<boolean | null>(null);
  const connectionRef = useRef<OverlayClientConnection | null>(null);
  const compositionReceivedRef = useRef(false);
  const bootstrapFailedRef = useRef(false);
  const pendingMutationsRef = useRef<OverlayMutation[]>([]);

  useEffect(() => {
    if (route === null) {
      return;
    }

    compositionReceivedRef.current = false;
    bootstrapFailedRef.current = false;
    pendingMutationsRef.current = [];
    const queueMutation = (mutation: OverlayMutation): void => {
      if (pendingMutationsRef.current.length >= maximumPendingOverlayMutations) {
        bootstrapFailedRef.current = true;
        pendingMutationsRef.current = [];
        connectionRef.current?.close();
        setComposition(null);
        setMuted(null);
        return;
      }
      pendingMutationsRef.current.push(mutation);
    };
    const connection = connectOverlayClient({
      route,
      onMessage(message: OverlayClientMessage) {
        if (message.type === "composition") {
          if (bootstrapFailedRef.current) return;
          const composition = pendingMutationsRef.current.reduce(
            (current, mutation) => applyMutation(current, route, mutation),
            message.composition
          );
          pendingMutationsRef.current = [];
          compositionReceivedRef.current = true;
          setComposition(composition);
        } else if (message.type === "start") {
          if (!preparedIdsRef.current.delete(message.instructionId)) return;
          setComposition(current => current === null ? null : { ...current, modules: current.modules.map(module => ({ ...module,
            instructions: module.instructions.map(instruction => instruction.id !== message.instructionId ? instruction : { ...instruction,
              timing: { startsAtEpochMs: message.startsAtEpochMs, endsAtEpochMs: message.startsAtEpochMs + instruction.durationMs } }) })) });
          setPreparingIds(new Set(preparedIdsRef.current));
        } else if (message.type === "playback" || message.type === "prepare") {
          if (!instructionMatchesRoute(route, message.instruction)) return;
          if (seenIdsRef.current.has(message.instruction.id)) return;
          seenIdsRef.current.add(message.instruction.id);
          if (seenIdsRef.current.size > 1000) seenIdsRef.current.delete(seenIdsRef.current.values().next().value!);
          if (message.type === "prepare") {
            preparedIdsRef.current.add(message.instruction.id);
            setPreparingIds(new Set(preparedIdsRef.current));
          }
          if (!compositionReceivedRef.current) queueMutation(message);
          else setComposition((current) => appendInstruction(current, route, message.instruction));
        } else if (message.type === "audio-state") {
          setMuted(message.muted);
        } else if (message.type === "surface-layers") {
          if (route.scope !== "unified") return;
          if (!compositionReceivedRef.current) queueMutation(message);
          else setComposition(current => current === null ? null : applySurfaceLayers(current, message.layers));
        } else if (message.type === "stop") {
          for (const id of message.instructionIds) preparedIdsRef.current.delete(id);
          setPreparingIds(new Set(preparedIdsRef.current));
          if (!compositionReceivedRef.current) queueMutation(message);
          else setComposition((current) => removeInstructions(current, message.instructionIds));
        } else {
          preparedIdsRef.current.clear();
          setPreparingIds(new Set());
          compositionReceivedRef.current = false;
          pendingMutationsRef.current = [];
          setComposition(null);
          setMuted(null);
        }
      }
    });
    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
      compositionReceivedRef.current = false;
      bootstrapFailedRef.current = false;
      pendingMutationsRef.current = [];
    };
  }, [route]);

  const onPlaybackEvent = useCallback((event: OverlayPlaybackEvent) => {
    if (event.status === "completed" || event.status === "failed") {
      preparedIdsRef.current.delete(event.instructionId);
      setPreparingIds(new Set(preparedIdsRef.current));
      setComposition((current) => removeInstruction(current, event.instructionId));
    }

    const reporter = connectionRef.current?.reporter;
    if (reporter === undefined) {
      return;
    }

    if (event.status === "ready") {
      reporter.reportReady(event.instructionId);
    } else if (event.status === "started") {
      reporter.reportStarted(event.instructionId, event.diagnostics);
    } else if (event.status === "completed") {
      reporter.reportCompleted(event.instructionId, event.diagnostics);
    } else {
      reporter.reportFailed(event.instructionId, event.failure, event.diagnostics);
    }
  }, []);
  const resolveOverlayAssetUrl = useCallback(
    (assetId: string) => (route === null ? "" : createOverlayAssetUrl(route, assetId)),
    [route]
  );

  if (composition === null || muted === null) {
    return <div className="overlay-root" data-testid="overlay-root" style={overlayRootStyle} />;
  }

  return (
    <OverlaySurface
      composition={composition}
      preparingInstructionIds={preparingIds}
      muted={muted}
      onPlaybackEvent={onPlaybackEvent}
      resolveAssetUrl={resolveOverlayAssetUrl}
    />
  );
}

type OverlayMutation = Extract<OverlayClientMessage, { readonly type: "playback" | "prepare" | "stop" | "surface-layers" }>;

function applyMutation(
  composition: OverlayComposition,
  route: NonNullable<ReturnType<typeof parseOverlayRoute>>,
  mutation: OverlayMutation
): OverlayComposition {
  if (mutation.type === "surface-layers") return applySurfaceLayers(composition, mutation.layers);
  return mutation.type === "playback" || mutation.type === "prepare"
    ? appendInstruction(composition, route, mutation.instruction)
    : removeInstructions(composition, mutation.instructionIds) ?? composition;
}

function applySurfaceLayers(composition: OverlayComposition, layers: Extract<OverlayClientMessage, { type: "surface-layers" }>["layers"]): OverlayComposition {
  if (composition.scope !== "unified") return composition;
  const existing = new Map(composition.modules.map(module => [module.moduleId, module]));
  const modules: OverlayModuleSnapshot[] = layers.map((layer, index) => ({
    ...(existing.get(layer.moduleId) ?? { moduleId: layer.moduleId, enabled: true, instructions: [] }),
    surfaceLayer: { visible: layer.visible, zIndex: layers.length - index }
  }));
  // Removed registry rows retain their audio/completion owner until its normal end.
  for (const module of composition.modules) {
    if (!layers.some(layer => layer.moduleId === module.moduleId)) modules.push({ ...module, surfaceLayer: { visible: false, zIndex: 0 } });
  }
  return { ...composition, modules };
}

function appendInstruction(
  composition: OverlayComposition | null,
  route: NonNullable<ReturnType<typeof parseOverlayRoute>>,
  instruction: OverlayInstruction
): OverlayComposition {
  const currentComposition =
    composition ??
    ({
      overlayId: route.overlayId,
      purpose: route.purpose,
      scope: route.scope,
      targetProfileId: route.targetProfileId,
      modules: []
    } satisfies OverlayComposition);
  if (currentComposition.modules.some((moduleSnapshot) =>
    moduleSnapshot.instructions.some((currentInstruction) => currentInstruction.id === instruction.id)
  )) {
    return currentComposition;
  }
  const modules = currentComposition.modules.map((moduleSnapshot): OverlayModuleSnapshot => {
    if (moduleSnapshot.moduleId !== instruction.moduleId) {
      return moduleSnapshot;
    }

    return {
      ...moduleSnapshot,
      instructions: [...moduleSnapshot.instructions, instruction]
    };
  });

  if (!modules.some((moduleSnapshot) => moduleSnapshot.moduleId === instruction.moduleId)) {
    modules.push({
      moduleId: instruction.moduleId,
      enabled: true,
      instructions: [instruction]
    });
  }

  return {
    ...currentComposition,
    modules
  };
}

function removeInstruction(composition: OverlayComposition | null, instructionId: string): OverlayComposition | null {
  return removeInstructions(composition, [instructionId]);
}

function removeInstructions(
  composition: OverlayComposition | null,
  instructionIds: readonly string[]
): OverlayComposition | null {
  if (composition === null) {
    return null;
  }

  const stopped = new Set(instructionIds);
  let changed = false;
  const modules = composition.modules.map((moduleSnapshot): OverlayModuleSnapshot => {
    const instructions = moduleSnapshot.instructions.filter((instruction) => !stopped.has(instruction.id));
    if (instructions.length === moduleSnapshot.instructions.length) {
      return moduleSnapshot;
    }

    changed = true;
    return {
      ...moduleSnapshot,
      instructions
    };
  });

  return changed ? { ...composition, modules } : composition;
}

function instructionMatchesRoute(
  route: NonNullable<ReturnType<typeof parseOverlayRoute>>,
  instruction: OverlayInstruction
): boolean {
  if (
    route.overlayId !== instruction.overlayId ||
    route.purpose !== instruction.purpose ||
    route.scope !== instruction.scope ||
    route.targetProfileId !== (instruction.targetProfileId ?? null)
  ) {
    return false;
  }

  if (route.scope === "module") {
    return route.moduleId === instruction.moduleId;
  }

  return route.moduleId === null;
}
