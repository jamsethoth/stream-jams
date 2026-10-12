import { sceneOutputCanvas } from "@stream-jams/core";
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
  it("discards lower Data revisions and retired runtimes while retaining current unrelated modules", async () => {
    const onMessage = vi.fn(); connectClient(onMessage); await vi.advanceTimersByTimeAsync(0); onMessage.mockClear();
    const socket = FakeWebSocket.instances[0]!;
    const send = (runtimeId: string, revision: number) => socket.emitMessage(JSON.stringify({ type: "overlay.composition", composition: {
      runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(), overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", modules: [
        { moduleId: "data-overlays", enabled: true, instructions: [], presentation: { kind: "data-overlays", projection: { runtimeId, revision, canvases: [] } } },
        { moduleId: "alerts", enabled: revision % 2 === 0, instructions: [] }
      ]
    } }));
    send("first", 5); send("first", 4); send("second", 0); send("first", 10);
    expect(onMessage.mock.calls.map(call => call[0].composition.modules[0].presentation.projection)).toEqual([
      { runtimeId: "first", revision: 5, canvases: [] }, { runtimeId: "first", revision: 5, canvases: [] },
      { runtimeId: "second", revision: 0, canvases: [] }, { runtimeId: "second", revision: 0, canvases: [] }
    ]);
    expect(onMessage.mock.calls[1]![0].composition.modules[1].enabled).toBe(true);
  });
  it("ignores callbacks from a disconnected socket after reconnect and close", async () => {
    const onMessage = vi.fn(); const connection = connectClient(onMessage);
    const old = FakeWebSocket.instances[0]!; old.emit("open"); await vi.advanceTimersByTimeAsync(0);
    old.emitClose(1006); await vi.advanceTimersByTimeAsync(1000);
    onMessage.mockClear(); old.emitMessage(JSON.stringify({ type: "overlay.playback.audio-state", muted: true }));
    expect(onMessage).not.toHaveBeenCalled();
    connection.close(); FakeWebSocket.instances[1]!.emitMessage(JSON.stringify({ type: "overlay.playback.audio-state", muted: false }));
    expect(onMessage).not.toHaveBeenCalled();
  });
  it("builds artwork URLs only for live Music outputs and preserves profile scope", () => {
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/modules/music/live/ovl_music?profile=vertical")!, "art_safe"))
      .toBe("/overlay/modules/music/live/ovl_music/artwork/art_safe?profile=vertical");
    expect(createOverlayMusicArtworkUrl(parseOverlayRoute("/overlay/unified/live/ovl_unified")!, "art_safe"))
      .toBe("");
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
      .toBe("");
  });
  it("parses validated composition updates from the live socket", async () => {
    const onMessage = vi.fn(); connectClient(onMessage); await vi.advanceTimersByTimeAsync(0); onMessage.mockClear();
    const composition = { runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(), overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape",
      modules: [{ moduleId: "alerts", enabled: true, instructions: [] }] };
    FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.composition", composition }));
    FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.composition", composition: { ...composition, modules: "bad" } }));
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "composition", composition });
  });

  it("rejects delayed pre-reset geometry on the same socket and reconnect initializes current canvas", async () => {
    const onMessage = vi.fn();
    const connection = connectClient(onMessage);
    const oldSocket = FakeWebSocket.instances[0]!;
    oldSocket.emit("open");
    await vi.advanceTimersByTimeAsync(0);
    onMessage.mockClear();
    const composition = { runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(10, 800, 600), overlayId: "default", purpose: "live", scope: "module", modules: [] };
    oldSocket.emitMessage(JSON.stringify({ type: "overlay.composition", composition }));
    oldSocket.emitMessage(JSON.stringify({ type: "overlay.composition", composition: { ...composition, canvas: sceneOutputCanvas(9, 1920, 1080) } }));
    oldSocket.emitMessage(JSON.stringify({ type: "overlay.composition", composition: { ...composition, runtimeId: "unrelated-runtime" } }));
    expect(onMessage.mock.calls.filter(([message]) => message.type === "composition")).toEqual([[{ type: "composition", composition }]]);
    oldSocket.emitClose(1006);
    await vi.advanceTimersByTimeAsync(1000);
    const currentSocket = FakeWebSocket.instances[1]!;
    currentSocket.emit("open");
    onMessage.mockClear();
    const current = { ...composition, runtimeId: "new-runtime", canvas: sceneOutputCanvas(0, 400, 300) };
    // A service restart is accepted only by a fresh connection, before its initial HTTP capture pins identity.
    currentSocket.emitMessage(JSON.stringify({ type: "overlay.composition", composition: current }));
    oldSocket.emitMessage(JSON.stringify({ type: "overlay.composition", composition }));
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "composition", composition: current });
    await vi.advanceTimersByTimeAsync(0);
    expect(onMessage).toHaveBeenCalledTimes(1);
    connection.close();
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
  it("parses ordinary module paths without query-string credentials and rejects retired paths", () => {
    expect(parseOverlayRoute("/overlay/modules/alerts/live/ovl_moduleKey?key=ovl_queryKey")).toMatchObject({
      overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: null, rawKey: "ovl_moduleKey",
      compositionPath: "/overlay/modules/alerts/live/ovl_moduleKey/composition", webSocketPath: "/overlay/ws/modules/alerts/live/ovl_moduleKey"
    });
    expect(parseOverlayRoute("/overlay/modules/alerts/test/ovl_moduleKey?key=ovl_queryKey")).toBeNull();
    expect(parseOverlayRoute("/overlay/unified/live/ovl_unifiedKey")).toBeNull();
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
      ""
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
    reporter.reportDuration("video:item-1", 212_000);

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
      },
      { type: "overlay.playback.duration", instructionId: "video:item-1", mediaDurationMs: 212_000 }
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(),
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

  it("validates independent module audio states and rejects malformed policies", () => {
    const onMessage = vi.fn(); connectClient(onMessage);
    for (const moduleMutes of [{ alerts: true, "screen-effects": false }, { alerts: "yes", "screen-effects": false }, { alerts: true }]) {
      FakeWebSocket.instances[0]!.emitMessage(JSON.stringify({ type: "overlay.playback.audio-state", muted: false, moduleMutes }));
    }
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "audio-state", muted: false, moduleMutes: { alerts: true, "screen-effects": false } });
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

describe("overlay-client Videos mirror signaling", () => {
  it("relays validated mirror signals to subscribers without treating them as overlay messages", async () => {
    const onMessage = vi.fn();
    const connection = connectClient(onMessage);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    const received: unknown[] = [];
    const unsubscribe = connection.videoMirror.subscribe(signal => received.push(signal));
    // Nothing is sent before the socket opens.
    connection.videoMirror.send({ type: "hello", connection: 1 });
    expect(socket.sent).toEqual([]);
    socket.emit("open");
    connection.videoMirror.send({ type: "hello", connection: 1 });
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: "videos.mirror.signal", signal: { type: "hello", connection: 1 } });
    socket.emitMessage(JSON.stringify({ type: "videos.mirror.signal", signal: { type: "offer", connection: 1, sdp: "v=0" } }));
    socket.emitMessage(JSON.stringify({ type: "videos.mirror.signal", signal: { type: "ice", connection: 1, candidate: { candidate: "candidate:1 1 udp 1 203.0.113.1 5000 typ relay" } } }));
    socket.emitMessage(JSON.stringify({ type: "videos.mirror.signal", signal: { type: "answer", connection: 1, sdp: "v=0" } }));
    expect(received).toEqual([{ type: "offer", connection: 1, sdp: "v=0" }]);
    expect(onMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "videos.mirror.signal" }));
    unsubscribe();
    socket.emitMessage(JSON.stringify({ type: "videos.mirror.signal", signal: { type: "not-ready", connection: 1 } }));
    expect(received).toHaveLength(1);
    connection.close();
  });

  it("bounds mirror subscribers per page and clears them on close", async () => {
    const connection = connectClient();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    const listeners = Array.from({ length: 6 }, () => vi.fn());
    for (const listener of listeners) connection.videoMirror.subscribe(listener);
    const signal = JSON.stringify({ type: "videos.mirror.signal", signal: { type: "not-ready", connection: 1 } });
    socket.emitMessage(signal);
    expect(listeners.map(listener => listener.mock.calls.length)).toEqual([1, 1, 1, 1, 0, 0]);
    connection.close();
    socket.emitMessage(signal);
    expect(listeners.map(listener => listener.mock.calls.length)).toEqual([1, 1, 1, 1, 0, 0]);
  });
});

function connectClient(onMessage = vi.fn()) {
  return connectOverlayClient({
    route: parseOverlayRoute("/overlay/modules/alerts/live/ovl_reconnect?profile=landscape")!,
    fetcher: vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(),
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
