import type { OverlayClientMessage } from "./overlay-client.js";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayApp } from "./OverlayApp.js";

const clientHarness = vi.hoisted(() => ({
  close: vi.fn(),
  onMessage: null as ((message: unknown) => void) | null,
  reportReady: vi.fn(),
  reportCompleted: vi.fn(),
  reportFailed: vi.fn(),
  reportStarted: vi.fn()
}));

vi.mock("./overlay-client.js", async () => {
  const actual = await vi.importActual<typeof import("./overlay-client.js")>("./overlay-client.js");
  return {
    ...actual,
    connectOverlayClient: vi.fn((options: { readonly onMessage: (message: OverlayClientMessage) => void }) => {
      clientHarness.onMessage = options.onMessage as (message: unknown) => void;
      return {
        close: clientHarness.close,
        reporter: {
          reportReady: clientHarness.reportReady,
          reportCompleted: clientHarness.reportCompleted,
          reportFailed: clientHarness.reportFailed,
          reportStarted: clientHarness.reportStarted
        }
      };
    })
  };
});

describe("OverlayApp playback lifecycle", () => {
  it("keeps prepared text hidden until start and ignores duplicate or stale starts", async () => {
    vi.setSystemTime(1000);
    render(<OverlayApp />);
    const instruction = { id: "prepared", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: "landscape", visual: null, audio: null, tts: null,
      text: { text: "Prepared content", layout: { x: 0, y: 0, width: 300, height: 80, zIndex: 1 } }, durationMs: 1000 };
    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({ type: "composition", composition: { overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", modules: [] } });
      clientHarness.onMessage?.({ type: "prepare", instruction });
    });
    await act(async () => {});
    expect(screen.getByText("Prepared content")).not.toBeVisible();
    expect(clientHarness.reportReady).toHaveBeenCalledWith("prepared");
    expect(clientHarness.reportStarted).not.toHaveBeenCalled();
    act(() => clientHarness.onMessage?.({ type: "start", instructionId: "prepared", startsAtEpochMs: 1100 }));
    act(() => vi.advanceTimersByTime(99));
    expect(clientHarness.reportStarted).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Prepared content")).toBeVisible();
    expect(clientHarness.reportStarted).toHaveBeenCalledTimes(1);
    act(() => clientHarness.onMessage?.({ type: "start", instructionId: "prepared", startsAtEpochMs: 5000 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Prepared content")).not.toBeInTheDocument();
    act(() => {
      clientHarness.onMessage?.({ type: "prepare", instruction });
      clientHarness.onMessage?.({ type: "start", instructionId: "prepared", startsAtEpochMs: 5000 });
    });
    expect(screen.queryByText("Prepared content")).not.toBeInTheDocument();
  });
  it("applies queued and live unified layers without restarting active instructions", () => {
    window.history.replaceState(null, "", "/overlay/unified/live/test-local");
    render(<OverlayApp />);
    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({ type: "surface-layers", layers: [{ moduleId: "alerts", visible: false }] });
      clientHarness.onMessage?.({ type: "composition", composition: {
        overlayId: "default", purpose: "live", scope: "unified", modules: [{ moduleId: "alerts", enabled: true, instructions: [{
          id: "layer-test", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "unified", visual: null, audio: null, tts: null,
          text: { text: "Layer content", layout: { x: 0, y: 0, width: 300, height: 80, zIndex: 100 } }, durationMs: 1000
        }] }]
      } });
    });
    const element = screen.getByText("Layer content");
    expect(element).not.toBeVisible();
    act(() => {
      vi.advanceTimersByTime(500);
      clientHarness.onMessage?.({ type: "surface-layers", layers: [{ moduleId: "future", visible: false }, { moduleId: "alerts", visible: true }] });
    });
    expect(screen.getByText("Layer content")).toBe(element);
    expect(element).toBeVisible();
    expect(clientHarness.reportStarted).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(500));
    expect(clientHarness.reportCompleted).toHaveBeenCalledWith("layer-test", expect.objectContaining({ terminalOutcome: "completed" }));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/overlay/modules/alerts/live/ovl_live?profile=landscape");
  });

  afterEach(() => {
    cleanup();
    clientHarness.onMessage = null;
    vi.clearAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("removes an instruction after reporting its configured playback duration", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{ moduleId: "alerts", enabled: true, instructions: [] }]
        }
      });
      clientHarness.onMessage?.({
        type: "playback",
        instruction: {
          id: "instruction-test",
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          visual: null,
          audio: null,
          text: {
            text: "Temporary test alert",
            layout: { x: 10, y: 20, width: 300, height: 80, zIndex: 1 }
          },
          tts: null,
          durationMs: 250
        }
      });
    });

    expect(screen.getByText("Temporary test alert")).toBeInTheDocument();
    expect(clientHarness.reportStarted).toHaveBeenCalledWith("instruction-test", expect.objectContaining({ actualStartEpochMs: expect.any(Number) }));

    act(() => vi.advanceTimersByTime(250));

    expect(clientHarness.reportCompleted).toHaveBeenCalledWith("instruction-test", expect.objectContaining({ terminalOutcome: "completed" }));
    expect(screen.queryByText("Temporary test alert")).not.toBeInTheDocument();
  });

  it("removes an instruction after reporting a playback failure", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{ moduleId: "alerts", enabled: true, instructions: [] }]
        }
      });
      clientHarness.onMessage?.({
        type: "playback",
        instruction: {
          id: "instruction-failed",
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          visual: {
            assetId: "missing-image",
            mediaType: "image",
            layout: { x: 10, y: 20, width: 300, height: 80, zIndex: 1 }
          },
          audio: null,
          text: null,
          tts: null,
          durationMs: 5_000
        }
      });
    });

    fireEvent.error(screen.getByTestId("overlay-visual-instruction-failed"));

    expect(clientHarness.reportFailed).toHaveBeenCalledWith("instruction-failed", expect.objectContaining({
      referenceId: expect.stringMatching(/^err_/),
      stage: "source-load",
      message: "Image playback failed",
      exception: expect.objectContaining({ type: expect.any(String) })
    }), expect.objectContaining({ terminalOutcome: "failed" }));
    expect(screen.queryByTestId("overlay-visual-instruction-failed")).not.toBeInTheDocument();
  });

  it("clears live output without rendering transport or internal diagnostics", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{
            moduleId: "alerts",
            enabled: true,
            instructions: [{
              id: "instruction-before-failure",
              overlayId: "default",
              moduleId: "alerts",
              purpose: "live",
              scope: "module",
              targetProfileId: "landscape",
              visual: null,
              audio: null,
              text: {
                text: "Visible before failure",
                layout: { x: 10, y: 20, width: 300, height: 80, zIndex: 1 }
              },
              tts: null,
              durationMs: 5_000
            }]
          }]
        }
      });
    });
    expect(screen.getByText("Visible before failure")).toBeInTheDocument();

    act(() => {
      clientHarness.onMessage?.({
        type: "error",
        message: "Internal overlay failure ref-overlay-secret"
      });
    });

    expect(screen.getByTestId("overlay-root")).toBeEmptyDOMElement();
    expect(document.body).not.toHaveTextContent("Internal overlay failure");
    expect(document.body).not.toHaveTextContent("ref-overlay-secret");
  });

  it("removes targeted instructions without reporting false completion", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{
            moduleId: "alerts",
            enabled: true,
            instructions: [
              {
                id: "stop-me",
                overlayId: "default",
                moduleId: "alerts",
                purpose: "live",
                scope: "module",
                targetProfileId: "landscape",
                visual: null,
                audio: null,
                text: { text: "Stop me", layout: { x: 0, y: 0, width: 300, height: 80, zIndex: 1 } },
                tts: null,
                durationMs: 5_000
              },
              {
                id: "keep-me",
                overlayId: "default",
                moduleId: "alerts",
                purpose: "live",
                scope: "module",
                targetProfileId: "landscape",
                visual: null,
                audio: null,
                text: { text: "Keep me", layout: { x: 0, y: 80, width: 300, height: 80, zIndex: 1 } },
                tts: null,
                durationMs: 5_000
              }
            ]
          }]
        }
      });
      clientHarness.onMessage?.({ type: "stop", instructionIds: ["stop-me"] });
    });

    expect(screen.queryByText("Stop me")).not.toBeInTheDocument();
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(clientHarness.reportCompleted).not.toHaveBeenCalled();
    expect(clientHarness.reportFailed).not.toHaveBeenCalled();
  });

  it("applies playback mutations received before the initial composition in order", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({ type: "stop", instructionIds: ["stale-instruction"] });
      clientHarness.onMessage?.({
        type: "playback",
        instruction: {
          id: "next-instruction",
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          visual: null,
          audio: null,
          text: { text: "Next alert", layout: { x: 0, y: 80, width: 300, height: 80, zIndex: 1 } },
          tts: null,
          durationMs: 5_000
        }
      });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{
            moduleId: "alerts",
            enabled: true,
            instructions: [{
              id: "stale-instruction",
              overlayId: "default",
              moduleId: "alerts",
              purpose: "live",
              scope: "module",
              targetProfileId: "landscape",
              visual: null,
              audio: null,
              text: { text: "Stale alert", layout: { x: 0, y: 0, width: 300, height: 80, zIndex: 1 } },
              tts: null,
              durationMs: 5_000
            }]
          }]
        }
      });
    });

    expect(screen.queryByText("Stale alert")).not.toBeInTheDocument();
    expect(screen.getByText("Next alert")).toBeInTheDocument();
  });

  it("does not duplicate an instruction present in both bootstrap channels", () => {
    render(<OverlayApp />);
    const instruction = createTextInstruction("shared-instruction", "One alert");

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      clientHarness.onMessage?.({ type: "playback", instruction });
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{ moduleId: "alerts", enabled: true, instructions: [instruction] }]
        }
      });
    });

    expect(screen.getAllByText("One alert")).toHaveLength(1);
  });

  it("fails closed when bootstrap mutations exceed the bounded buffer", () => {
    render(<OverlayApp />);

    act(() => {
      clientHarness.onMessage?.({ type: "audio-state", muted: false });
      for (let index = 0; index <= 100; index += 1) {
        clientHarness.onMessage?.({
          type: "playback",
          instruction: createTextInstruction(`buffered-${index}`, `Buffered ${index}`)
        });
      }
      clientHarness.onMessage?.({
        type: "composition",
        composition: {
          overlayId: "default",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          modules: [{ moduleId: "alerts", enabled: true, instructions: [createTextInstruction("stale", "Stale")] }]
        }
      });
    });

    expect(screen.getByTestId("overlay-root")).toBeEmptyDOMElement();
    expect(clientHarness.close).toHaveBeenCalledOnce();
  });
});

function createTextInstruction(id: string, text: string) {
  return {
    id,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "live" as const,
    scope: "module" as const,
    targetProfileId: "landscape",
    visual: null,
    audio: null,
    text: { text, layout: { x: 0, y: 0, width: 300, height: 80, zIndex: 1 } },
    tts: null,
    durationMs: 5_000
  };
}
