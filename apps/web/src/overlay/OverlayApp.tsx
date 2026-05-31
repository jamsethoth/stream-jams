import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OverlayComposition,
  OverlayInstruction,
  OverlayModuleSnapshot
} from "@stream-jams/core";
import {
  connectOverlayClient,
  parseOverlayRoute,
  type OverlayClientConnection,
  type OverlayClientMessage
} from "./overlay-client.js";
import { OverlaySurface, overlayRootStyle, type OverlayPlaybackEvent } from "./components/OverlaySurface.js";

export { OverlaySurface } from "./components/OverlaySurface.js";

export function OverlayApp() {
  const route = useMemo(() => parseOverlayRoute(window.location.pathname), []);
  const [composition, setComposition] = useState<OverlayComposition | null>(null);
  const [error, setError] = useState<string | null>(route === null ? "Overlay route is unavailable" : null);
  const connectionRef = useRef<OverlayClientConnection | null>(null);

  useEffect(() => {
    if (route === null) {
      return;
    }

    const connection = connectOverlayClient({
      route,
      onMessage(message: OverlayClientMessage) {
        if (message.type === "composition") {
          setError(null);
          setComposition(message.composition);
        } else if (message.type === "playback") {
          if (instructionMatchesRoute(route, message.instruction)) {
            setComposition((current) => appendInstruction(current, route, message.instruction));
          }
        } else {
          setError(message.message);
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

  if (composition === null) {
    return (
      <div className="overlay-root" data-testid="overlay-root" style={overlayRootStyle}>
        {error === null ? null : <p className="overlay-error">{error}</p>}
      </div>
    );
  }

  return <OverlaySurface composition={composition} onPlaybackEvent={onPlaybackEvent} resolveAssetUrl={resolveAssetUrl} />;
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

function instructionMatchesRoute(
  route: NonNullable<ReturnType<typeof parseOverlayRoute>>,
  instruction: OverlayInstruction
): boolean {
  if (
    route.overlayId !== instruction.overlayId ||
    route.purpose !== instruction.purpose ||
    route.scope !== instruction.scope
  ) {
    return false;
  }

  if (route.scope === "module") {
    return route.moduleId === instruction.moduleId;
  }

  return route.moduleId === null;
}

function resolveAssetUrl(assetId: string): string {
  return `/assets/${encodeURIComponent(assetId)}`;
}
