import { serializeException, overlayInstructionSchema, overlayCompositionSchema, surfaceLayersSchema, type SurfaceLayer } from "@stream-jams/core";
import type {
  OverlayPlaybackFailure,
  PlaybackTimingDiagnostics,
  PlaybackTimingMilestone,
  OverlayComposition,
  OverlayInstruction,
  OverlayPurpose,
  OverlayScope,
  OverlayTargetProfileId
} from "@stream-jams/core";

export interface ParsedOverlayRoute {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId: OverlayTargetProfileId | null;
  readonly rawKey: string;
  readonly compositionPath: string;
  readonly webSocketPath: string;
}

export interface OverlayPlaybackReporter {
  reportReady(instructionId: string): void;
  reportStarted(instructionId: string, diagnostics?: PlaybackTimingMilestone): void;
  reportCompleted(instructionId: string, diagnostics?: PlaybackTimingDiagnostics): void;
  reportFailed(instructionId: string, failure: OverlayPlaybackFailure, diagnostics?: PlaybackTimingDiagnostics): void;
}

export interface OverlaySocketLike {
  readonly readyState: number;
  send(message: string): void;
}

export type OverlayClientMessage =
  | { readonly type: "prepare"; readonly instruction: OverlayInstruction }
  | { readonly type: "start"; readonly instructionId: string; readonly startsAtEpochMs: number }
  | { readonly type: "surface-layers"; readonly layers: readonly SurfaceLayer[] }
  | {
      readonly type: "composition";
      readonly composition: OverlayComposition;
    }
  | {
      readonly type: "playback";
      readonly instruction: OverlayInstruction;
    }
  | {
      readonly type: "audio-state";
      readonly muted: boolean;
    }
  | {
      readonly type: "stop";
      readonly instructionIds: readonly string[];
    }
  | {
      readonly type: "error";
      readonly message: string;
    };

export interface OverlayClientOptions {
  readonly route: ParsedOverlayRoute;
  readonly fetcher?: typeof fetch;
  readonly WebSocketCtor?: typeof WebSocket;
  readonly onMessage: (message: OverlayClientMessage) => void;
}

export interface OverlayClientConnection {
  readonly reporter: OverlayPlaybackReporter;
  close(): void;
}

const websocketOpenState = 1;

export function parseOverlayRoute(pathWithOptionalQuery: string): ParsedOverlayRoute | null {
  const url = new URL(pathWithOptionalQuery, "http://stream-jams.local");
  const pathname = url.pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "overlay") {
    return null;
  }

  if (segments[1] === "modules" && segments.length === 5) {
    const [, , moduleId, purpose, rawKey] = segments;
    if (moduleId === undefined || rawKey === undefined || !isOverlayPurpose(purpose)) {
      return null;
    }

    const targetProfileId = parseTargetProfile(url.searchParams);
    if (targetProfileId === undefined) {
      return null;
    }
    const profileQuery = targetProfileQuery(targetProfileId);

    return {
      overlayId: "default",
      moduleId,
      purpose,
      scope: "module",
      targetProfileId,
      rawKey,
      compositionPath: `/overlay/modules/${moduleId}/${purpose}/${rawKey}/composition${profileQuery}`,
      webSocketPath: `/overlay/ws/modules/${moduleId}/${purpose}/${rawKey}${profileQuery}`
    };
  }

  if (segments[1] === "unified" && segments.length === 4) {
    const [, , purpose, rawKey] = segments;
    if (rawKey === undefined || !isOverlayPurpose(purpose) || url.searchParams.has("profile")) {
      return null;
    }

    return {
      overlayId: "default",
      moduleId: null,
      purpose,
      scope: "unified",
      targetProfileId: null,
      rawKey,
      compositionPath: `/overlay/unified/${purpose}/${rawKey}/composition`,
      webSocketPath: `/overlay/ws/unified/${purpose}/${rawKey}`
    };
  }

  return null;
}

export function createOverlayWebSocketUrl(origin: string, route: Pick<ParsedOverlayRoute, "webSocketPath">): string {
  const url = new URL(route.webSocketPath, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function createOverlayAssetUrl(route: ParsedOverlayRoute, assetId: string): string {
  const encodedAssetId = encodeURIComponent(assetId);
  if (route.scope === "module") {
    return `/overlay/modules/${encodeURIComponent(route.moduleId ?? "")}/${route.purpose}/${encodeURIComponent(route.rawKey)}/assets/${encodedAssetId}${targetProfileQuery(route.targetProfileId)}`;
  }

  return `/overlay/unified/${route.purpose}/${encodeURIComponent(route.rawKey)}/assets/${encodedAssetId}`;
}

export function createOverlayPlaybackReporter(socket: OverlaySocketLike): OverlayPlaybackReporter {
  return {
    reportReady(instructionId: string) { sendIfOpen(socket, { type: "overlay.playback.ready", instructionId }); },
    reportStarted(instructionId: string, diagnostics?: PlaybackTimingMilestone) {
      sendIfOpen(socket, {
        type: "overlay.playback.started",
        instructionId,
        ...(diagnostics === undefined ? {} : { diagnostics })
      });
    },
    reportCompleted(instructionId: string, diagnostics?: PlaybackTimingDiagnostics) {
      sendIfOpen(socket, {
        type: "overlay.playback.completed",
        instructionId,
        ...(diagnostics === undefined ? {} : { diagnostics })
      });
    },
    reportFailed(instructionId: string, failure: OverlayPlaybackFailure, diagnostics?: PlaybackTimingDiagnostics) {
      sendIfOpen(socket, {
        type: "overlay.playback.failed",
        instructionId,
        ...failure,
        ...(diagnostics === undefined ? {} : { diagnostics })
      });
    }
  };
}

export function connectOverlayClient(options: OverlayClientOptions): OverlayClientConnection {
  const fetcher = options.fetcher ?? fetch;
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const webSocketUrl = createOverlayWebSocketUrl(window.location.origin, options.route);
  let disposed = false;
  let reconnectDelayMs = 1_000;
  let reconnectTimer: number | null = null;
  let socket: WebSocket | null = null;
  let connectionGeneration = 0;
  let settledCompositionGeneration = 0;
  const reporter = createOverlayPlaybackReporter({
    get readyState() {
      return socket?.readyState ?? WebSocket.CLOSED;
    },
    send(message: string) {
      socket?.send(message);
    }
  });

  const openSocket = () => {
    if (disposed) {
      return;
    }

    const nextSocket = new WebSocketCtor(webSocketUrl);
    let generation = 0;
    socket = nextSocket;
    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) return;
      reconnectDelayMs = 1_000;
      generation = ++connectionGeneration;
      void fetcher(options.route.compositionPath)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Overlay composition request failed with ${response.status}`);
          return overlayCompositionSchema.parse(await response.json()) as OverlayComposition;
        })
        .then((composition) => {
          if (disposed || socket !== nextSocket || settledCompositionGeneration >= generation) return;
          settledCompositionGeneration = generation;
          options.onMessage({ type: "composition", composition });
        })
        .catch((error: unknown) => {
          if (disposed || socket !== nextSocket || settledCompositionGeneration >= generation) return;
          options.onMessage({ type: "error", message: error instanceof Error ? error.message : "Overlay composition request failed" });
          nextSocket.close();
        });
    });
    nextSocket.addEventListener("message", (event) => {
      const message = parseOverlaySocketMessage(event.data, (instructionId, failure) => reporter.reportFailed(instructionId, failure));
      if (message?.type === "composition" && generation > 0) settledCompositionGeneration = Math.max(settledCompositionGeneration, generation);
      if (message !== null) options.onMessage(message);
    });
    // Browsers expose no cause on WebSocket error; close carries the diagnostic
    // and follows a failed connection, so report that boundary once.
    nextSocket.addEventListener("error", () => undefined);
    nextSocket.addEventListener("close", (event) => {
      if (disposed || socket !== nextSocket) {
        return;
      }

      socket = null;
      const closeCode = Number.isInteger(event.code) ? event.code : 1006;
      const closeReason = (event.reason ?? "").replaceAll(options.route.rawKey, "[redacted]")
        .replace(/(?:https?|wss?):\/\/[^\s]+/giu, "[redacted-url]").slice(0, 512);
      options.onMessage({
        type: "error",
        message: `Overlay transport connection closed (${closeCode})${closeReason === "" ? "" : `: ${closeReason}`}. ${closeCode === 1008 ? "Reconnection stopped." : `Reconnecting in ${reconnectDelayMs}ms.`}`
      });
      if (event.code === 1008) {
        return;
      }

      const delayMs = reconnectDelayMs;
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openSocket();
      }, delayMs);
    });
  };

  openSocket();

  return {
    reporter,
    close() {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
    }
  };
}

function parseOverlaySocketMessage(data: unknown, reportInvalid: (instructionId: string, failure: OverlayPlaybackFailure) => void): OverlayClientMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  }
  // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
  catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as {
    readonly type?: unknown;
    readonly instruction?: unknown;
    readonly instructionId?: unknown;
    readonly startsAtEpochMs?: unknown;
    readonly muted?: unknown;
    readonly instructionIds?: unknown;
    readonly message?: unknown;
    readonly layers?: unknown;
    readonly composition?: unknown;
  };
  if (candidate.type === "overlay.surface-layers") {
    const layers = surfaceLayersSchema.safeParse(candidate.layers);
    return layers.success ? { type: "surface-layers", layers: layers.data } : null;
  }
  if (candidate.type === "overlay.composition") {
    const composition = overlayCompositionSchema.safeParse(candidate.composition);
    return composition.success ? { type: "composition", composition: composition.data as OverlayComposition } : null;
  }
  if (candidate.type === "overlay.playback.start" && typeof candidate.instructionId === "string" && typeof candidate.startsAtEpochMs === "number" && Number.isFinite(candidate.startsAtEpochMs)) {
    return { type: "start", instructionId: candidate.instructionId, startsAtEpochMs: candidate.startsAtEpochMs };
  }
  if ((candidate.type === "overlay.playback" || candidate.type === "overlay.playback.prepare") && typeof candidate.instruction === "object" && candidate.instruction !== null) {
    const instruction = overlayInstructionSchema.safeParse(candidate.instruction);
    if (instruction.success) return { type: candidate.type === "overlay.playback.prepare" ? "prepare" : "playback", instruction: instruction.data as OverlayInstruction };
    const id = (candidate.instruction as { readonly id?: unknown }).id;
    if (typeof id === "string" && /^[a-zA-Z0-9_:.-]{1,200}$/u.test(id)) reportInvalid(id, {
      referenceId: `err_${crypto.randomUUID()}`, stage: "source-load", message: "Overlay playback instruction failed validation.",
      exception: serializeException(instruction.error)
    });
    return null;
  }

  if (candidate.type === "overlay.playback.audio-state" && typeof candidate.muted === "boolean") {
    return { type: "audio-state", muted: candidate.muted };
  }

  if (
    candidate.type === "overlay.playback.stop" &&
    Array.isArray(candidate.instructionIds) &&
    candidate.instructionIds.length > 0 &&
    candidate.instructionIds.every((instructionId) => typeof instructionId === "string" && instructionId !== "")
  ) {
    return { type: "stop", instructionIds: candidate.instructionIds as string[] };
  }

  return candidate.type === "overlay.error" && typeof candidate.message === "string"
    ? { type: "error", message: candidate.message }
    : null;
}

function sendIfOpen(socket: OverlaySocketLike, message: unknown): void {
  if (socket.readyState === websocketOpenState) {
    socket.send(JSON.stringify(message));
  }
}

function isOverlayPurpose(value: unknown): value is OverlayPurpose {
  return value === "live" || value === "test";
}

function parseTargetProfile(searchParams: URLSearchParams): OverlayTargetProfileId | null | undefined {
  const values = searchParams.getAll("profile");
  if (values.length === 0) {
    return null;
  }

  return values.length === 1 && (values[0] === "landscape" || values[0] === "vertical")
    ? values[0]
    : undefined;
}

function targetProfileQuery(targetProfileId: OverlayTargetProfileId | null): string {
  return targetProfileId === null ? "" : `?profile=${encodeURIComponent(targetProfileId)}`;
}
