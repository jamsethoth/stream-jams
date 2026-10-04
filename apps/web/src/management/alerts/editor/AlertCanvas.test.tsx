import { createTestMediaPreviewApi, previewDescriptor } from "../../../test-support/media-preview-fixture.js";
import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument
} from "@stream-jams/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { AlertCanvas } from "./AlertCanvas.js";

afterEach(cleanup);

describe("AlertCanvas", () => {
  it("renders GIF assets as animated images and respects video loop settings", async () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
    let mimeType: "image/gif" | "video/mp4" = "image/gif";
    const mediaApi: AssetApi = { ...assetApi, ...createTestMediaPreviewApi(async id => { const descriptor = previewDescriptor(id); return { ...descriptor, snapshot: { ...descriptor.snapshot, mimeType } }; }), getAssetFile: vi.fn(async () => new Blob(["media"])) };
    const visualDocument: AlertEditorDocument = {
      ...editorDocument,
      layers: [{
        id: "visual", name: "Visual", type: "video", visible: true, order: 0, assetId: "animated",
        loop: false, playEmbeddedAudio: false, audioVolume: 1, animation: editorDocument.layers[0]!.animation
      }],
      targetProfiles: editorDocument.targetProfiles.map((profile) => ({
        ...profile,
        layerLayouts: profile.id === "landscape" ? [{ layerId: "visual", x: 0, y: 0, width: 320, height: 180, zIndex: 0 }] : []
      }))
    };
    const props = { assetApi: mediaApi, document: visualDocument, onGeometryChange: vi.fn(), onSelectLayer: vi.fn(), preview: true,
      profileId: "landscape" as const, samplePayload: {}, selectedLayerId: null };
    const { rerender } = render(<AlertCanvas {...props} assetMediaTypes={{ animated: "gif" }} />);
    expect(await screen.findByRole("img", { name: "Animated image asset preview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Video asset preview")).not.toBeInTheDocument();

    mimeType = "video/mp4";
    rerender(<AlertCanvas {...props} assetRevision="replacement" assetMediaTypes={{ animated: "video" }} document={{ ...visualDocument,
      layers: visualDocument.layers.map((layer) => layer.type === "video" ? { ...layer, loop: true } : layer) }} />);
    await waitFor(() => expect(screen.getByLabelText("Video asset preview")).toHaveProperty("loop", true));
  });

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
      animationPlayState: "paused",
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

  it("moves the focused layer by one pixel or ten with Shift", async () => {
    const user = userEvent.setup();
    const onGeometryChange = vi.fn();
    render(
      <AlertCanvas
        assetApi={assetApi}
        document={editorDocument}
        onGeometryChange={onGeometryChange}
        onSelectLayer={vi.fn()}
        preview={false}
        profileId="landscape"
        samplePayload={{}}
        selectedLayerId={null}
      />
    );
    const layer = screen.getByRole("button", { name: "Badge layer" });
    layer.focus();

    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(onGeometryChange).toHaveBeenNthCalledWith(1, "layer-shape", expect.objectContaining({ x: 193, y: 108 }));
    expect(onGeometryChange).toHaveBeenNthCalledWith(2, "layer-shape", expect.objectContaining({ x: 192, y: 118 }));
  });
  it("snaps pointer moves to visible peers, separates switches, and clears gesture guides", () => {
    const capture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540, toJSON: () => ({}) });
    try {
      const document: AlertEditorDocument = { ...editorDocument,
        layers: [...editorDocument.layers, { ...editorDocument.layers[0]!, id: "peer", name: "Peer", order: 1 }],
        targetProfiles: editorDocument.targetProfiles.map(profile => profile.id === "landscape" ? { ...profile, layerLayouts: [...profile.layerLayouts, { layerId: "peer", x: 300, y: 400, width: 120, height: 100, zIndex: 2 }] } : profile) };
      const onGeometryChange = vi.fn();
      const props = { assetApi, document, onGeometryChange, onSelectLayer: vi.fn(), preview: false, profileId: "landscape" as const, samplePayload: {}, selectedLayerId: "layer-shape" };
      const { container, rerender } = render(<AlertCanvas {...props} snapToGrid={false} />);
      const layer = screen.getByRole("button", { name: "Badge layer" });
      fireEvent.pointerDown(layer, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(layer, { pointerId: 1, clientX: 52, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 300, y: 108 }));
      expect(container.querySelector(".alert-canvas__snap-guide--x")).toHaveStyle({ left: "15.625%" });
      fireEvent.pointerUp(layer, { pointerId: 1 });
      expect(container.querySelector(".alert-canvas__snap-guide")).toBeNull();
      rerender(<AlertCanvas {...props} snapToGrid={false} snapToAlignment={false} />);
      fireEvent.pointerDown(layer, { pointerId: 2, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(layer, { pointerId: 2, clientX: 52, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 296, y: 108 }));
      rerender(<AlertCanvas {...props} snapToGrid snapToAlignment={false} showGrid={false} />);
      fireEvent.pointerMove(layer, { pointerId: 2, clientX: 52, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 300, y: 110 }));
      expect(container.querySelector(".alert-canvas__grid")).toBeNull();
      fireEvent.pointerCancel(layer, { pointerId: 2 });
      expect(container.querySelector(".alert-canvas__snap-guide")).toBeNull();
      const hiddenPeerDocument = { ...document, layers: document.layers.map(candidate => candidate.id === "peer" ? { ...candidate, visible: false } : candidate) };
      rerender(<AlertCanvas {...props} document={hiddenPeerDocument} snapToGrid={false} />);
      fireEvent.pointerDown(layer, { pointerId: 3, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(layer, { pointerId: 3, clientX: 52, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 296, y: 108 }));
      expect(container.querySelector(".alert-canvas__snap-guide")).toBeNull();
      fireEvent.pointerUp(layer, { pointerId: 3 });
      const speechPeerDocument = { ...document, layers: document.layers.map(candidate => candidate.id === "peer" ? {
        id: candidate.id, name: "Speech", type: "tts" as const, visible: true, order: candidate.order, animation: candidate.animation,
        enabled: true, providerId: "browser-speech", template: "Nonvisual peer"
      } : candidate) };
      rerender(<AlertCanvas {...props} document={speechPeerDocument} snapToGrid={false} />);
      fireEvent.pointerDown(layer, { pointerId: 5, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(layer, { pointerId: 5, clientX: 52, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 296, y: 108 }));
      expect(container.querySelector(".alert-canvas__snap-guide")).toBeNull();
      fireEvent.pointerUp(layer, { pointerId: 5 });
      rerender(<AlertCanvas {...props} snapToGrid={false} />);
      const handle = layer.querySelector(".alert-canvas__resize-handle")!;
      fireEvent.pointerDown(handle, { pointerId: 4, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(handle, { pointerId: 4, clientX: -123, clientY: 0 });
      expect(onGeometryChange).toHaveBeenLastCalledWith("layer-shape", expect.objectContaining({ x: 192, y: 108, width: 228, height: 270 }));
      expect(container.querySelector(".alert-canvas__snap-guide--x")).toHaveStyle({ left: "21.875%" });
      rerender(<AlertCanvas {...props} profileId="vertical" />);
      expect(container.querySelector(".alert-canvas__snap-guide")).toBeNull();
    } finally {
      cleanup(); rect.mockRestore();
      if (capture === undefined) Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
      else Object.defineProperty(HTMLElement.prototype, "setPointerCapture", capture);
    }
  });

});

const assetApi: AssetApi = {
  listAssets: vi.fn(async () => []),
  importAsset: vi.fn(),
  ...createTestMediaPreviewApi(),
  getAssetFile: vi.fn(),
  replaceAsset: vi.fn()
};

const editorDocument: AlertEditorDocument = { schemaVersion: 1,
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
  outputs: { browserSource: true, deviceRouteIds: [] },
  layers: [{
    id: "layer-shape",
    name: "Badge",
    type: "shape",
    visible: true,
    order: 0,
    fill: "#123456FF",
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
