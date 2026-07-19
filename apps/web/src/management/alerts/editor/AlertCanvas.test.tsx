import type { AlertEditorDocument } from "@stream-jams/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { AlertCanvas } from "./AlertCanvas.js";

afterEach(cleanup);

describe("AlertCanvas", () => {
  it("uses profile geometry and preset timing only while previewing", () => {
    const props = {
      assetApi,
      document: editorDocument,
      onGeometryChange: vi.fn(),
      onSelectLayer: vi.fn(),
      profileId: "landscape" as const,
      samplePayload: {},
      selectedLayerId: null,
      viewState: { zoom: 100, scrollLeft: 0, scrollTop: 0 },
      background: { mode: "checkerboard" as const, color: "#1a1e23" },
      showGrid: true,
      showSafeArea: true,
      onViewStateChange: vi.fn()
    };
    const { container, rerender } = render(<AlertCanvas {...props} preview={false} />);
    const layer = screen.getByRole("button", { name: "Badge layer" });

    expect(layer).toHaveStyle({
      height: "25%",
      left: "10%",
      top: "10%",
      width: "25%",
      zIndex: "7"
    });
    expect(layer.style.animationName).toBe("");
    expect(container.querySelector(".alert-canvas__shape")).toHaveStyle({ background: "#123456" });

    rerender(<AlertCanvas {...props} preview previewRunId={1} />);

    const firstPreviewLayer = screen.getByRole("button", { name: "Badge layer" });
    expect(firstPreviewLayer).toHaveStyle({
      animationDelay: "75ms, 1700ms",
      animationDuration: "300ms, 300ms",
      animationFillMode: "both, forwards",
      animationName: "overlay-enter-slide-up, overlay-exit-slide-down",
      animationTimingFunction: "ease-in-out, ease-in-out"
    });

    rerender(<AlertCanvas {...props} preview previewElapsedMs={150} previewRunId={1} />);
    expect(screen.getByRole("button", { name: "Badge layer" })).toHaveStyle({
      animationDelay: "-75ms, 1550ms"
    });

    rerender(<AlertCanvas {...props} preview previewRunId={2} />);
    expect(screen.getByRole("button", { name: "Badge layer" })).not.toBe(firstPreviewLayer);
  });

  it("supports session-only canvas guides and background choices", () => {
    const { container, rerender } = render(
      <AlertCanvas
        assetApi={assetApi}
        background={{ mode: "neutral", color: "#20252b" }}
        document={editorDocument}
        onGeometryChange={vi.fn()}
        onSelectLayer={vi.fn()}
        onViewStateChange={vi.fn()}
        preview={false}
        profileId="landscape"
        samplePayload={{}}
        selectedLayerId={null}
        showGrid={false}
        showSafeArea={false}
        viewState={{ zoom: 100, scrollLeft: 0, scrollTop: 0 }}
      />
    );

    expect(container.querySelector(".alert-canvas__safe-area")).not.toBeInTheDocument();
    expect(container.querySelector(".alert-canvas__grid")).not.toBeInTheDocument();
    expect(container.querySelector(".alert-canvas__surface")).toHaveStyle({ backgroundColor: "#20252b" });

    rerender(
      <AlertCanvas
        assetApi={assetApi}
        background={{ mode: "test", color: "#00ff00" }}
        document={editorDocument}
        onGeometryChange={vi.fn()}
        onSelectLayer={vi.fn()}
        onViewStateChange={vi.fn()}
        preview={false}
        profileId="landscape"
        samplePayload={{}}
        selectedLayerId={null}
        showGrid
        showSafeArea
        viewState={{ zoom: 100, scrollLeft: 0, scrollTop: 0 }}
      />
    );
    expect(container.querySelector(".alert-canvas__safe-area")).toBeInTheDocument();
    expect(container.querySelector(".alert-canvas__grid")).toBeInTheDocument();
    expect(container.querySelector(".alert-canvas__surface")).toHaveStyle({ backgroundColor: "#00ff00" });
  });
});

const assetApi: AssetApi = {
  listAssets: vi.fn(async () => []),
  importAsset: vi.fn(),
  getAssetFile: vi.fn(),
  replaceAsset: vi.fn()
};

const editorDocument: AlertEditorDocument = {
  id: "alert-1",
  setId: "set-1",
  providerKind: "twitch",
  eventType: "follow",
  kind: "default",
  parentAlertId: null,
  name: "Follower",
  enabled: true,
  conditions: [],
  variantConditions: [],
  weight: 1,
  priority: null,
  cooldownSeconds: 0,
  rulePriority: 0,
  durationMs: 2_000,
  layers: [{
    id: "layer-shape",
    name: "Badge",
    type: "shape",
    visible: true,
    order: 0,
    fill: "#123456",
    animation: {
      mode: "preset",
      entrance: "slide-up",
      exit: "slide-down",
      durationMs: 300,
      delayMs: 75,
      easing: "ease-in-out"
    }
  }],
  targetProfiles: [{
    id: "landscape",
    enabled: true,
    reviewState: "ready",
    layerLayouts: [{ layerId: "layer-shape", x: 192, y: 108, width: 480, height: 270, zIndex: 7 }]
  }, {
    id: "vertical",
    enabled: false,
    reviewState: "needs-review",
    layerLayouts: []
  }],
  samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
};
