import { renderManagement as render } from "../../test-support/render-management.js";
import { createTestMediaPreviewApi, previewDescriptor } from "../../test-support/media-preview-fixture.js";
import { timersOverlayModuleDefinition, type TimerDefinition } from "@stream-jams/core";
import { act, cleanup, screen } from "@testing-library/react";
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
    render(<TimerStackEditor assetApi={createTestMediaPreviewApi()} value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    const preview = screen.getByLabelText("landscape timer preview");
    act(() => resizeCallback?.([{ contentRect: { width: 900 } } as ResizeObserverEntry], {} as ResizeObserver));

    expect(preview).toHaveStyle({ width: "900px", height: "506.25px" });
    expect(preview.firstElementChild).toHaveStyle({ transform: "scale(0.46875)" });
  });

  it("loads saved timer icons through the authenticated asset API, then uses clocks only for examples", async () => {
    const createPreview = vi.fn(async (id: string) => previewDescriptor(id));
    const api = createTestMediaPreviewApi(createPreview);
    const release = vi.spyOn(api, "releasePreview");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "/storybook-assets/tiny-image.png"), revokeObjectURL });
    const saved: TimerDefinition = {
      id: "saved-mitts",
      label: "Saved oven mitt timer",
      durationMs: 45_000,
      iconAssetId: "saved-icon",
      startAudioAssetId: null,
      endAudioAssetId: null,
      outputs: { browserSource: true, deviceRouteIds: [] },
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z"
    };
    const definitionProps = { definitions: [saved] };
    const view = render(<TimerStackEditor assetApi={api} {...definitionProps} value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    const cards = screen.getAllByRole("listitem");
    expect(cards[0]).toHaveTextContent("Saved oven mitt timer");
    expect(await screen.findByRole("img", { name: "Saved oven mitt timer icon" })).toHaveAttribute("src", "/storybook-assets/tiny-image.png");
    expect(createPreview).toHaveBeenCalledWith("saved-icon");
    expect(cards.some(card => card.textContent?.includes("Timer 1"))).toBe(true);
    expect(cards.some(card => card.textContent?.includes("deliberately long"))).toBe(true);
    expect(screen.getAllByRole("img", { name: "Default timer icon" })).toHaveLength(cards.length - 1);
    expect(screen.getByText("+2 more")).toBeVisible();
    view.unmount();
    expect(release).toHaveBeenCalledWith("preview-saved-icon");
  });
});
