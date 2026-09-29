import { timersOverlayModuleDefinition } from "@stream-jams/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimerStackEditor } from "./TimerStackEditor.js";

let resizeCallback: ResizeObserverCallback | undefined;

class PreviewResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  disconnect() {}
  observe() {}
  unobserve() {}
}

afterEach(() => {
  cleanup();
  resizeCallback = undefined;
  vi.unstubAllGlobals();
});

describe("TimerStackEditor", () => {
  it("fills the available preview width while preserving the output profile scale", () => {
    vi.stubGlobal("ResizeObserver", PreviewResizeObserver);
    render(<TimerStackEditor value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    const preview = screen.getByLabelText("landscape timer preview");
    act(() => resizeCallback?.([{ contentRect: { width: 900 } } as ResizeObserverEntry], {} as ResizeObserver));

    expect(preview).toHaveStyle({ width: "900px", height: "506.25px" });
    expect(preview.firstElementChild).toHaveStyle({ transform: "scale(0.46875)" });
  });

  it("shows representative custom and default icons plus the overflow badge", () => {
    render(<TimerStackEditor value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    expect(screen.getByRole("img", { name: "Cat paws reward icon" })).toBeVisible();
    expect(screen.getAllByRole("img", { name: "Default timer icon" }).length).toBeGreaterThan(0);
    expect(screen.getByText("+2 more")).toBeVisible();
  });
});
