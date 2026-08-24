import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument
} from "@stream-jams/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("renders approved aliases from the event-specific sample context", () => {
    const textDocument: AlertEditorDocument = {
      ...editorDocument,
      eventType: "community_gift",
      layers: [{
        id: "layer-text",
        name: "Message",
        type: "text",
        visible: true,
        order: 0,
        template: "{gifterName} gifted {giftCount}; {cumulativeGifts} total.",
        textStyle: {
          ...compatibilityAlertTextStyle,
          fontPreset: "serif",
          fontSizePx: 64,
          fontWeight: 700,
          horizontalAlign: "left",
          verticalAlign: "bottom",
          color: "#FFCC00FF",
          shadow: null
        },
        boxStyle: {
          backgroundColor: "#102030BF",
          paddingPx: 24,
          cornerRadiusPx: 18,
          shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
        },
        animation: editorDocument.layers[0]!.animation
      }],
      targetProfiles: editorDocument.targetProfiles.map((profile) => ({
        ...profile,
        layerLayouts: profile.id === "landscape"
          ? [{ layerId: "layer-text", x: 100, y: 100, width: 800, height: 160, zIndex: 1 }]
          : []
      }))
    };

    render(
      <AlertCanvas
        assetApi={assetApi}
        document={textDocument}
        onGeometryChange={vi.fn()}
        onSelectLayer={vi.fn()}
        preview={false}
        profileId="landscape"
        samplePayload={{
          actor: { id: "gifter-1", displayName: "Generous viewer" },
          amount: 5,
          tier: "1000",
          cumulativeTotal: 42
        }}
        selectedLayerId={null}
        viewState={{ zoom: 50, scrollLeft: 0, scrollTop: 0 }}
      />
    );

    const styledText = screen.getByText("Generous viewer gifted 5; 42 total.");
    expect(styledText.style.backgroundColor).toBe("rgba(16, 32, 48, 0.75)");
    expect(styledText.style.borderRadius).toBe("9px");
    expect(styledText.style.boxShadow).toBe("2px 3px 6px #00000080");
    expect(styledText.style.color).toBe("rgb(255, 204, 0)");
    expect(styledText.style.fontFamily).toBe('Georgia, "Times New Roman", serif');
    expect(styledText.style.fontSize).toBe("32px");
    expect(styledText.style.fontWeight).toBe("700");
    expect(styledText.style.justifyContent).toBe("flex-end");
    expect(styledText.style.padding).toBe("12px");
    expect(styledText.style.textAlign).toBe("left");
    expect(styledText.style.textShadow).toBe("none");
  });

  it("interpolates templates while authoring and uses moderated text while previewing", () => {
    const textDocument: AlertEditorDocument = {
      ...editorDocument,
      layers: [{
        id: "layer-text",
        name: "Message",
        type: "text",
        visible: true,
        order: 0,
        template: "Welcome {userName}",
        textStyle: compatibilityAlertTextStyle,
        boxStyle: compatibilityAlertTextBoxStyle,
        animation: editorDocument.layers[0]!.animation
      }],
      targetProfiles: editorDocument.targetProfiles.map((profile) => ({
        ...profile,
        layerLayouts: profile.id === "landscape"
          ? [{ layerId: "layer-text", x: 100, y: 100, width: 800, height: 160, zIndex: 1 }]
          : []
      }))
    };
    const props = {
      assetApi,
      document: textDocument,
      onGeometryChange: vi.fn(),
      onSelectLayer: vi.fn(),
      profileId: "landscape" as const,
      samplePayload: { userName: "unmoderated-name" },
      selectedLayerId: null,
      viewState: { zoom: 100, scrollLeft: 0, scrollTop: 0 }
    };
    const { rerender } = render(<AlertCanvas {...props} preview={false} />);

    expect(screen.getByText("Welcome unmoderated-name")).toBeInTheDocument();

    rerender(
      <AlertCanvas
        {...props}
        preview
        previewTextByLayerId={{ "layer-text": "Welcome [blocked]" }}
      />
    );

    expect(screen.getByText("Welcome [blocked]")).toBeInTheDocument();
    expect(screen.queryByText("Welcome unmoderated-name")).not.toBeInTheDocument();
  });

  it("selects a focused layer with Enter or Space and exposes pressed state", async () => {
    const user = userEvent.setup();
    const onSelectLayer = vi.fn();
    const props = {
      assetApi,
      background: { mode: "checkerboard" as const, color: "#1a1e23" },
      document: editorDocument,
      onGeometryChange: vi.fn(),
      onSelectLayer,
      onViewStateChange: vi.fn(),
      preview: false,
      profileId: "landscape" as const,
      samplePayload: {},
      showGrid: true,
      showSafeArea: true,
      viewState: { zoom: 100, scrollLeft: 0, scrollTop: 0 }
    };
    const { rerender } = render(<AlertCanvas {...props} selectedLayerId={null} />);
    const layer = screen.getByRole("button", { name: "Badge layer" });

    expect(layer).toHaveAttribute("aria-pressed", "false");
    layer.focus();
    await user.keyboard("{Enter}");
    expect(onSelectLayer).toHaveBeenLastCalledWith("layer-shape");

    rerender(<AlertCanvas {...props} selectedLayerId="layer-shape" />);
    const selectedLayer = screen.getByRole("button", { name: "Badge layer" });
    expect(selectedLayer).toHaveAttribute("aria-pressed", "true");
    selectedLayer.focus();
    await user.keyboard(" ");
    expect(onSelectLayer).toHaveBeenCalledTimes(2);
    expect(props.onGeometryChange).not.toHaveBeenCalled();
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
