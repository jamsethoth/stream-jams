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
        } else if (message.type === "playback") {
          if (!instructionMatchesRoute(route, message.instruction)) return;
          if (!compositionReceivedRef.current) queueMutation(message);
          else setComposition((current) => appendInstruction(current, route, message.instruction));
        } else if (message.type === "audio-state") {
          setMuted(message.muted);
        } else if (message.type === "stop") {
          if (!compositionReceivedRef.current) queueMutation(message);
          else setComposition((current) => removeInstructions(current, message.instructionIds));
        } else {
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
      setComposition((current) => removeInstruction(current, event.instructionId));
    }

    const reporter = connectionRef.current?.reporter;
    if (reporter === undefined) {
      return;
    }

    if (event.status === "started") {
      reporter.reportStarted(event.instructionId);
    } else if (event.status === "completed") {
      reporter.reportCompleted(event.instructionId);
    } else {
      reporter.reportFailed(event.instructionId, event.message ?? "Overlay playback failed");
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
      muted={muted}
      onPlaybackEvent={onPlaybackEvent}
      resolveAssetUrl={resolveOverlayAssetUrl}
    />
  );
}

type OverlayMutation = Extract<OverlayClientMessage, { readonly type: "playback" | "stop" }>;

function applyMutation(
  composition: OverlayComposition,
  route: NonNullable<ReturnType<typeof parseOverlayRoute>>,
  mutation: OverlayMutation
): OverlayComposition {
  return mutation.type === "playback"
    ? appendInstruction(composition, route, mutation.instruction)
    : removeInstructions(composition, mutation.instructionIds) ?? composition;
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
