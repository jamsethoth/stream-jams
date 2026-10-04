import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectOverlayClient,
  createOverlayAssetUrl,
  createOverlayMusicArtworkUrl,
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
  it("builds artwork URLs only for live Music outputs and preserves profile scope", () => {
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/modules/music/live/ovl_music?profile=vertical")!, "art_safe"))
      .toBe("/overlay/modules/music/live/ovl_music/artwork/art_safe?profile=vertical");
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/unified/live/ovl_unified")!, "art_safe"))
      .toBe("/overlay/unified/live/ovl_unified/music/artwork/art_safe");
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/modules/music/test/ovl_test")!, "art_safe")).toBe("");
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/modules/alerts/live/ovl_alert")!, "art_safe")).toBe("");
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/modules/music/live/ovl_music")!, "https://remote/")).toBe("");
  });
  it("pins immutable media versions without losing target-profile authorization", () => {
    const version = "a".repeat(64);
    expect(createOverlayAssetUrl(parseOverlayRoute("/overlay/modules/alerts/live/ovl_profile?profile=vertical")!, "clip", version))
      .toBe(`/overlay/modules/alerts/live/ovl_profile/assets/clip?profile=vertical&version=${version}`);
    expect(createOverlayAssetUrl(parseOverlayRoute("/overlay/modules/alerts/live/ovl_profile")!, "clip", version))
      .toBe(`/overlay/modules/alerts/live/ovl_profile/assets/clip?version=${version}`);
    expect(createOverlayAssetUrl(parseOverlayRoute("/overlay/unified/live/ovl_profile")!, "clip", version))
      .toBe(`/overlay/unified/live/ovl_profile/assets/clip?version=${version}`);
  });
  it("parses validated composition updates from the live socket", async () => {
    const onMessage = vi.fn(); connectClient(onMessage); await vi.advanceTimersByTimeAsync(0); onMessage.mockClear();
    const composition = { overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape",
      modules: [{ moduleId: "alerts", enabled: true, instructions: [] }] };
    FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.composition", composition }));
    FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.composition", composition: { ...composition, modules: "bad" } }));
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "composition", composition });
  });

  it("validates complete layer control payloads and rejects duplicate or malformed rows", () => {
    const onMessage = vi.fn();
    connectClient(onMessage);
    const layers = [{ moduleId: "alerts", visible: false }];
    for (const value of [layers, [...layers, ...layers], [{ moduleId: "alerts", visible: "yes" }], [{ ...layers[0], rawKey: "no" }]]) {
      FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.surface-layers", layers: value }));
    }
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "surface-layers", layers });
  });
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

    reporter.reportStarted("instruction-1", { preparationDurationMs: 25, scheduledStartEpochMs: 100, actualStartEpochMs: 105 });
    reporter.reportCompleted("instruction-1");
    reporter.reportFailed("instruction-2", {
      referenceId: "err_failure",
      stage: "play",
      message: "media failed",
      exception: { type: "NotSupportedError", message: "unsupported", stack: null, code: null, cause: null, thrownValue: null }
    });

    expect(socket.sent).toEqual([
      {
        type: "overlay.playback.started",
        instructionId: "instruction-1",
        diagnostics: { preparationDurationMs: 25, scheduledStartEpochMs: 100, actualStartEpochMs: 105 }
      },
      {
        type: "overlay.playback.completed",
        instructionId: "instruction-1"
      },
      {
        type: "overlay.playback.failed",
        instructionId: "instruction-2",
        referenceId: "err_failure",
        stage: "play",
        message: "media failed",
        exception: { type: "NotSupportedError", message: "unsupported", stack: null, code: null, cause: null, thrownValue: null }
      }
    ]);
  });

  it.each(["overlay.playback", "overlay.playback.prepare"])("reports validated-ID %s schema failures without rendering them", type => {
    const onMessage = vi.fn(); connectClient(onMessage);
    const socket = FakeWebSocket.instances[0]!; socket.emit("open");
    socket.emitMessage(JSON.stringify({ type, instruction: { id: "bad-style", text: { textStyle: { fontPreset: "external-font" } } } }));
    expect(onMessage).not.toHaveBeenCalled();
    expect(socket.sent.map(message => JSON.parse(message))).toEqual([expect.objectContaining({
      type: "overlay.playback.failed", instructionId: "bad-style", stage: "source-load", referenceId: expect.stringMatching(/^err_/),
      message: "Overlay playback instruction failed validation.", exception: expect.objectContaining({ type: "ZodError" })
    })]);
  });
  it("does not forge validation reports for unrecognized messages or invalid IDs", () => {
    connectClient(); const socket = FakeWebSocket.instances[0]!; socket.emit("open");
    for (const id of [undefined, "", " ", "x".repeat(201), 1]) socket.emitMessage(JSON.stringify({ type: "overlay.playback", instruction: { id } }));
    socket.emitMessage(JSON.stringify({ type: "unknown", instruction: { id: "valid-id" } }));
    expect(socket.sent).toEqual([]);
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

  it("fetches a fresh authoritative composition after every successful connection", async () => {
    const onMessage = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({
      overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", modules: []
    }) });
    connectOverlayClient({
      route: parseOverlayRoute("/overlay/modules/alerts/live/ovl_reconnect?profile=landscape")!,
      fetcher: fetcher as unknown as typeof fetch,
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      onMessage
    });
    FakeWebSocket.instances[0]!.emit("open");
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0]!.emit("close");
    vi.advanceTimersByTime(1_000);
    FakeWebSocket.instances[1]!.emit("open");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onMessage.mock.calls.filter(([message]) => message.type === "composition")).toHaveLength(2);
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

  it("forwards a gateway overlay error through the existing client error state", () => {
    const onMessage = vi.fn();
    connectClient(onMessage);

    FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({
      type: "overlay.error",
      code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED",
      message: "Overlay route key is not authorized for this output"
    }));

    expect(onMessage).toHaveBeenCalledWith({
      type: "error",
      message: "Overlay route key is not authorized for this output"
    });
  });

  it("parses audio-state and targeted stop messages and ignores malformed controls", () => {
    const onMessage = vi.fn();
    connectClient(onMessage);

    for (const message of [
      { type: "overlay.playback.audio-state", muted: true },
      { type: "overlay.playback.stop", instructionIds: ["instruction-1", "instruction-2"] },
      { type: "overlay.playback.audio-state", muted: "yes" },
      { type: "overlay.playback.stop", instructionIds: [] },
      { type: "overlay.playback.stop", instructionIds: [""] }
    ]) {
      FakeWebSocket.instances[0]!.emitMessage(JSON.stringify(message));
    }

    expect(onMessage).toHaveBeenCalledWith({ type: "audio-state", muted: true });
    expect(onMessage).toHaveBeenCalledWith({ type: "stop", instructionIds: ["instruction-1", "instruction-2"] });
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it("preserves safe close evidence once and reconnects", () => {
    const onMessage = vi.fn();
    connectClient(onMessage);
    const socket = FakeWebSocket.instances[0]!;
    socket.emitClose(1006, "Lost wss://localhost/overlay/ovl_reconnect ovl_reconnect");
    socket.emitClose(1006, "duplicate");
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]![0].message).toContain("1006");
    expect(JSON.stringify(onMessage.mock.calls)).not.toContain("ovl_reconnect");
    vi.advanceTimersByTime(1000);
    FakeWebSocket.instances[1]!.emit("open");
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onMessage.mock.calls[0]![0].message).toContain("Lost [redacted-url] [redacted]");
    expect(onMessage.mock.calls[0]![0].message).toContain("Reconnecting in 1000ms");
  });

  it("treats a policy close as a terminal transport failure", () => {
    const onMessage = vi.fn();
    connectClient(onMessage);

    FakeWebSocket.instances[0]!.emitClose(1008);
    expect(onMessage).toHaveBeenCalledWith({
      type: "error",
      message: "Overlay transport connection closed (1008). Reconnection stopped."
    });
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

function connectClient(onMessage = vi.fn()) {
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
    onMessage
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

  emitClose(code: number, reason = ""): void {
    this.readyState = WebSocket.CLOSED;
    for (const listener of this.#listeners.get("close") ?? []) listener({ code, reason } as CloseEvent);
  }

  emitMessage(data: string): void {
    for (const listener of this.#listeners.get("message") ?? []) listener({ data } as MessageEvent);
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
