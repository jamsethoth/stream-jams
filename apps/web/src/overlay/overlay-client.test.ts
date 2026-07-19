import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectOverlayClient,
  createOverlayAssetUrl,
  createOverlayPlaybackReporter,
  createOverlayWebSocketUrl,
  parseOverlayRoute
} from "./overlay-client.js";

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe("overlay-client", () => {
  it("parses module and unified overlay routes without query-string credentials", () => {
    expect(parseOverlayRoute("/overlay/modules/alerts/test/ovl_moduleKey?key=ovl_queryKey")).toEqual({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      targetProfileId: null,
      rawKey: "ovl_moduleKey",
      compositionPath: "/overlay/modules/alerts/test/ovl_moduleKey/composition",
      webSocketPath: "/overlay/ws/modules/alerts/test/ovl_moduleKey"
    });
    expect(parseOverlayRoute("/overlay/unified/live/ovl_unifiedKey")).toEqual({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified",
      targetProfileId: null,
      rawKey: "ovl_unifiedKey",
      compositionPath: "/overlay/unified/live/ovl_unifiedKey/composition",
      webSocketPath: "/overlay/ws/unified/live/ovl_unifiedKey"
    });
  });

  it("carries a fixed target profile through composition, WebSocket, and asset requests", () => {
    const route = parseOverlayRoute("/overlay/modules/alerts/live/ovl_profile?profile=vertical");

    expect(route).toMatchObject({
      targetProfileId: "vertical",
      compositionPath: "/overlay/modules/alerts/live/ovl_profile/composition?profile=vertical",
      webSocketPath: "/overlay/ws/modules/alerts/live/ovl_profile?profile=vertical"
    });
    expect(createOverlayAssetUrl(route!, "asset image")).toBe(
      "/overlay/modules/alerts/live/ovl_profile/assets/asset%20image?profile=vertical"
    );
    expect(parseOverlayRoute("/overlay/modules/alerts/live/ovl_profile?profile=square")).toBeNull();
    expect(parseOverlayRoute("/overlay/unified/live/ovl_key?profile=vertical")).toBeNull();
  });

  it("rejects invalid overlay routes before opening transport", () => {
    expect(parseOverlayRoute("/manage")).toBeNull();
    expect(parseOverlayRoute("/overlay/modules/alerts/live")).toBeNull();
    expect(parseOverlayRoute("/overlay/unified/replay/ovl_key")).toBeNull();
  });

  it("builds ws and wss URLs from the current origin", () => {
    const route = parseOverlayRoute("/overlay/modules/alerts/live/ovl_moduleKey");

    expect(createOverlayWebSocketUrl("http://127.0.0.1:39187", route!)).toBe(
      "ws://127.0.0.1:39187/overlay/ws/modules/alerts/live/ovl_moduleKey"
    );
    expect(createOverlayWebSocketUrl("https://stream-jams.local", route!)).toBe(
      "wss://stream-jams.local/overlay/ws/modules/alerts/live/ovl_moduleKey"
    );
  });

  it("builds overlay-scoped media URLs from parsed routes", () => {
    expect(createOverlayAssetUrl(parseOverlayRoute("/overlay/modules/alerts/live/ovl_moduleKey")!, "asset image")).toBe(
      "/overlay/modules/alerts/live/ovl_moduleKey/assets/asset%20image"
    );
    expect(createOverlayAssetUrl(parseOverlayRoute("/overlay/unified/test/ovl_unifiedKey")!, "asset-audio")).toBe(
      "/overlay/unified/test/ovl_unifiedKey/assets/asset-audio"
    );
  });

  it("reports playback lifecycle events over the overlay socket", () => {
    const socket = new RecordingWebSocket();
    const reporter = createOverlayPlaybackReporter(socket);

    reporter.reportStarted("instruction-1");
    reporter.reportCompleted("instruction-1");
    reporter.reportFailed("instruction-2", "media failed");

    expect(socket.sent).toEqual([
      {
        type: "overlay.playback.started",
        instructionId: "instruction-1"
      },
      {
        type: "overlay.playback.completed",
        instructionId: "instruction-1"
      },
      {
        type: "overlay.playback.failed",
        instructionId: "instruction-2",
        message: "media failed"
      }
    ]);
  });

  it("reconnects after 1, 2, 4, 8, then 10 seconds capped", () => {
    connectClient();

    for (const delay of [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]) {
      FakeWebSocket.instances.at(-1)!.emit("close");
      vi.advanceTimersByTime(delay - 1);
      const socketCount = FakeWebSocket.instances.length;
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(socketCount + 1);
    }
  });

  it("resets reconnect backoff after a socket opens", () => {
    connectClient();
    FakeWebSocket.instances[0]!.emit("close");
    vi.advanceTimersByTime(1_000);
    FakeWebSocket.instances[1]!.emit("close");
    vi.advanceTimersByTime(2_000);

    FakeWebSocket.instances[2]!.emit("open");
    FakeWebSocket.instances[2]!.emit("close");
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it("cancels reconnect and closes the active socket when disposed", () => {
    const connection = connectClient();
    FakeWebSocket.instances[0]!.emit("close");
    vi.advanceTimersByTime(1_000);

    connection.close();
    expect(FakeWebSocket.instances[1]!.close).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

function connectClient() {
  return connectOverlayClient({
    route: parseOverlayRoute("/overlay/modules/alerts/live/ovl_reconnect?profile=landscape")!,
    fetcher: vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        overlayId: "default",
        purpose: "live",
        scope: "module",
        targetProfileId: "landscape",
        modules: []
      })
    }) as unknown as typeof fetch,
    WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
    onMessage: vi.fn()
  });
}

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  readonly close = vi.fn();
  readonly sent: string[] = [];
  readyState: number = WebSocket.CONNECTING;
  readonly #listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  emit(type: "open" | "close"): void {
    this.readyState = type === "open" ? WebSocket.OPEN : WebSocket.CLOSED;
    for (const listener of this.#listeners.get(type) ?? []) listener(new Event(type));
  }

  send(message: string): void {
    this.sent.push(message);
  }
}

class RecordingWebSocket {
  readonly sent: unknown[] = [];
  readonly readyState = 1;

  send(message: string): void {
    this.sent.push(JSON.parse(message) as unknown);
  }
}
