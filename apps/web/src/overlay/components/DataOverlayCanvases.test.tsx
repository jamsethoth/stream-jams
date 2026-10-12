import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectDataOverlays, type DataOverlayProjection, type DataProjectedElement } from "@stream-jams/core";
import { dataPreviewFixture } from "../../management/data-overlays/data-preview-fixtures.js";
import { DataOverlayCanvases } from "./DataOverlayCanvases.js";

afterEach(cleanup);
function projection(): DataOverlayProjection {
  return projectDataOverlays(dataPreviewFixture(), { runtimeId: "preview", output: "browser", targetProfileId: "landscape",
    nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: () => true });
}

describe("DataOverlayCanvases", () => {
  it("renders text literally with wrap/ellipsis styles and profile geometry", () => {
    const data = projection();
    const label = data.canvases[0]!.elements.find(item => item.id === "label-text")!;
    if (label.kind !== "text") throw new Error("Expected text");
    label.text = "<b>hi</b>";
    const { container } = render(<DataOverlayCanvases projection={data} resolveAssetUrl={() => null} />);
    expect(screen.getByText("<b>hi</b>").textContent).toBe("<b>hi</b>");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>hi</b>")).toHaveAttribute("data-overflow", "wrap");
    expect(screen.getByText("40 / 100")).toHaveAttribute("data-overflow", "ellipsis");
    expect(container.querySelector(".data-overlay-canvas")).toHaveStyle({ width: "1920px", height: "1080px" });
    expect(screen.getByText("<b>hi</b>")).toHaveStyle({ left: "40px", top: "40px", width: "640px", fontSize: "40px" });
  });
  it.each(["horizontal", "vertical"] as const)("anchors forward and reverse %s progress", orientation => {
    const data = projection();
    const bar = data.canvases[0]!.elements.find(item => item.kind === "progress")!;
    if (bar.kind !== "progress") throw new Error("Expected progress");
    bar.orientation = orientation;
    const { container, rerender } = render(<DataOverlayCanvases projection={data} resolveAssetUrl={() => null} />);
    const fill = container.querySelector<HTMLElement>(".data-overlay-progress-fill")!;
    expect(fill.style[orientation === "horizontal" ? "width" : "height"]).toBe("40%");
    expect(fill.style[orientation === "horizontal" ? "left" : "bottom"]).toBe("0px");
    bar.direction = "reverse";
    rerender(<DataOverlayCanvases projection={{ ...data, revision: 1 }} resolveAssetUrl={() => null} />);
    expect(fill.style[orientation === "horizontal" ? "right" : "top"]).toBe("0px");
    expect(fill.style[orientation === "horizontal" ? "left" : "bottom"]).toBe("");
  });
  it("hides unavailable or failed images without diagnostic markup and recovers on a new URL", () => {
    const data = projection();
    const { container, rerender } = render(<DataOverlayCanvases projection={data} resolveAssetUrl={() => null} />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<DataOverlayCanvases projection={data} resolveAssetUrl={() => "/tiny.svg"} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("40 / 100Community challenge");
    rerender(<DataOverlayCanvases projection={data} resolveAssetUrl={() => "/tiny.svg?v=2"} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/tiny.svg?v=2");
  });
  it("preserves element DOM identities across revisions and renders shape order", () => {
    const data = projection();
    const shape: DataProjectedElement = { id: "ellipse", kind: "ellipse", order: 1, x: 20, y: 20, width: 80, height: 80, color: "#ffffffff" };
    data.canvases[0]!.elements.push(shape);
    const { container, rerender } = render(<DataOverlayCanvases projection={data} resolveAssetUrl={() => "/tiny.svg"} />);
    const image = container.querySelector("img");
    const label = screen.getByText("Community challenge");
    const next = structuredClone(data);
    next.revision++;
    const text = next.canvases[0]!.elements.find(item => item.id === "label-text")!;
    if (text.kind === "text") text.text = "New label";
    rerender(<DataOverlayCanvases projection={next} resolveAssetUrl={() => "/tiny.svg"} />);
    expect(container.querySelector("img")).toBe(image);
    expect(screen.getByText("New label")).toBe(label);
    expect(container.querySelector('[data-element-id="ellipse"]')).toHaveStyle({ borderRadius: "50%", zIndex: 4 });
  });
  it("renders an empty projection transparently", () => {
    const { container } = render(<DataOverlayCanvases projection={{ runtimeId: "preview", revision: 0, canvases: [] }} resolveAssetUrl={() => null} />);
    expect(container.textContent).toBe("");
    expect(container.querySelector(".data-overlay-canvas")).toBeNull();
  });
});
