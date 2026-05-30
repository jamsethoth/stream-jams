import { describe, expect, it } from "vitest";
import {
  createOverlayPlaybackReporter,
  createOverlayWebSocketUrl,
  parseOverlayRoute
} from "./overlay-client.js";

describe("overlay-client", () => {
  it("parses module and unified overlay routes without query-string credentials", () => {
    expect(parseOverlayRoute("/overlay/modules/alerts/test/ovl_moduleKey?key=ovl_queryKey")).toEqual({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      rawKey: "ovl_moduleKey",
      compositionPath: "/overlay/modules/alerts/test/ovl_moduleKey/composition",
      webSocketPath: "/overlay/ws/modules/alerts/test/ovl_moduleKey"
    });
    expect(parseOverlayRoute("/overlay/unified/live/ovl_unifiedKey")).toEqual({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified",
      rawKey: "ovl_unifiedKey",
      compositionPath: "/overlay/unified/live/ovl_unifiedKey/composition",
      webSocketPath: "/overlay/ws/unified/live/ovl_unifiedKey"
    });
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
});

class RecordingWebSocket {
  readonly sent: unknown[] = [];
  readonly readyState = 1;

  send(message: string): void {
    this.sent.push(JSON.parse(message) as unknown);
  }
}
