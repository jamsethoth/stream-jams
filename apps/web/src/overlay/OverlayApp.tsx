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

export function OverlayApp() {
  const route = useMemo(() => parseOverlayRoute(`${window.location.pathname}${window.location.search}`), []);
  const [composition, setComposition] = useState<OverlayComposition | null>(null);
  const connectionRef = useRef<OverlayClientConnection | null>(null);

  useEffect(() => {
    if (route === null) {
      return;
    }

    const connection = connectOverlayClient({
      route,
      onMessage(message: OverlayClientMessage) {
        if (message.type === "composition") {
          setComposition(message.composition);
        } else if (message.type === "playback") {
          if (instructionMatchesRoute(route, message.instruction)) {
            setComposition((current) => appendInstruction(current, route, message.instruction));
          }
        } else {
          setComposition(null);
        }
      }
    });
    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
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

  if (composition === null) {
    return <div className="overlay-root" data-testid="overlay-root" style={overlayRootStyle} />;
  }

  return <OverlaySurface composition={composition} onPlaybackEvent={onPlaybackEvent} resolveAssetUrl={resolveOverlayAssetUrl} />;
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
  if (composition === null) {
    return null;
  }

  let changed = false;
  const modules = composition.modules.map((moduleSnapshot): OverlayModuleSnapshot => {
    const instructions = moduleSnapshot.instructions.filter((instruction) => instruction.id !== instructionId);
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
