import type { OverlayComposition, OverlayInstruction, OverlayPurpose, OverlayScope } from "@stream-jams/core";

export interface ParsedOverlayRoute {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly rawKey: string;
  readonly compositionPath: string;
  readonly webSocketPath: string;
}

export interface OverlayPlaybackReporter {
  reportStarted(instructionId: string): void;
  reportCompleted(instructionId: string): void;
  reportFailed(instructionId: string, message: string): void;
}

export interface OverlaySocketLike {
  readonly readyState: number;
  send(message: string): void;
}

export type OverlayClientMessage =
  | {
      readonly type: "composition";
      readonly composition: OverlayComposition;
    }
  | {
      readonly type: "playback";
      readonly instruction: OverlayInstruction;
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
  const pathname = new URL(pathWithOptionalQuery, "http://stream-jams.local").pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "overlay") {
    return null;
  }

  if (segments[1] === "modules" && segments.length === 5) {
    const [, , moduleId, purpose, rawKey] = segments;
    if (moduleId === undefined || rawKey === undefined || !isOverlayPurpose(purpose)) {
      return null;
    }

    return {
      overlayId: "default",
      moduleId,
      purpose,
      scope: "module",
      rawKey,
      compositionPath: `/overlay/modules/${moduleId}/${purpose}/${rawKey}/composition`,
      webSocketPath: `/overlay/ws/modules/${moduleId}/${purpose}/${rawKey}`
    };
  }

  if (segments[1] === "unified" && segments.length === 4) {
    const [, , purpose, rawKey] = segments;
    if (rawKey === undefined || !isOverlayPurpose(purpose)) {
      return null;
    }

    return {
      overlayId: "default",
      moduleId: null,
      purpose,
      scope: "unified",
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

export function createOverlayPlaybackReporter(socket: OverlaySocketLike): OverlayPlaybackReporter {
  return {
    reportStarted(instructionId: string) {
      sendIfOpen(socket, {
        type: "overlay.playback.started",
        instructionId
      });
    },
    reportCompleted(instructionId: string) {
      sendIfOpen(socket, {
        type: "overlay.playback.completed",
        instructionId
      });
    },
    reportFailed(instructionId: string, message: string) {
      sendIfOpen(socket, {
        type: "overlay.playback.failed",
        instructionId,
        message
      });
    }
  };
}

export function connectOverlayClient(options: OverlayClientOptions): OverlayClientConnection {
  const fetcher = options.fetcher ?? fetch;
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const socket = new WebSocketCtor(createOverlayWebSocketUrl(window.location.origin, options.route));
  const reporter = createOverlayPlaybackReporter(socket);

  void fetcher(options.route.compositionPath)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Overlay composition request failed with ${response.status}`);
      }

      return (await response.json()) as OverlayComposition;
    })
    .then((composition) =>
      options.onMessage({
        type: "composition",
        composition
      })
    )
    .catch((error: unknown) =>
      options.onMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Overlay composition request failed"
      })
    );

  socket.addEventListener("message", (event) => {
    const instruction = parsePlaybackInstructionMessage(event.data);
    if (instruction !== null) {
      options.onMessage({
        type: "playback",
        instruction
      });
    }
  });
  socket.addEventListener("error", () =>
    options.onMessage({
      type: "error",
      message: "Overlay transport connection failed"
    })
  );

  return {
    reporter,
    close() {
      socket.close();
    }
  };
}

function parsePlaybackInstructionMessage(data: unknown): OverlayInstruction | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as {
    readonly type?: unknown;
    readonly instruction?: unknown;
  };
  return candidate.type === "overlay.playback" && typeof candidate.instruction === "object" && candidate.instruction !== null
    ? (candidate.instruction as OverlayInstruction)
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
