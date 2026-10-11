import { createDefaultVideosLayout, type VideosLayout } from "@stream-jams/core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderManagement as render } from "../../test-support/render-management.js";
import { VideoPlacementEditor } from "./VideoPlacementEditor.js";

function Fixture({ initial = createDefaultVideosLayout(), disabled = false }: { readonly initial?: VideosLayout; readonly disabled?: boolean }) {
  const [layout, setLayout] = useState(initial);
  return <><VideoPlacementEditor value={layout} onChange={setLayout} disabled={disabled} /><output data-testid="layout">{JSON.stringify(layout)}</output></>;
}
const saved = () => JSON.parse(screen.getByTestId("layout").textContent!) as VideosLayout;

beforeEach(() => {
  // A 960 px wide preview: the canvas shows at half size, so one screen pixel is two canvas pixels.
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(984);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("VideoPlacementEditor", () => {
  it("previews the default box with a 16:9 picture and caption that match the overlay", () => {
    render(<Fixture />);
    const preview = screen.getByTestId("video-placement-preview");
    expect(preview).toHaveStyle({ left: "269px", top: "140px", width: "1382px", height: "876px" });
    expect(preview.querySelector(".video-overlay__frame")).toHaveStyle({ width: "1382px", height: "777.375px" });
    expect(preview).toHaveTextContent("Example video titleRequested by Viewer");
    expect(screen.getByRole("group", { name: "Video placement canvas" })).toHaveStyle({ width: "960px", height: "540px" });
  });

  it("snaps a dragged box to the canvas center, or to the grid when alignment is off, and shows the guide only while dragging", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const move = screen.getByRole("button", { name: "Move video box" });
    fireEvent.pointerDown(move, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 103, clientY: 101 });
    expect(saved()).toEqual({ x: 269, y: 140, width: 1382, height: 876 });
    expect(document.querySelector("[data-snap-axis='x']")).toHaveAttribute("data-snap-position", "960");
    fireEvent.pointerUp(move, { pointerId: 1 });
    expect(document.querySelector("[data-snap-axis]")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Snap to alignment" }));
    fireEvent.pointerDown(move, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 2, clientX: 103, clientY: 101 });
    expect(saved()).toMatchObject({ x: 280, y: 140 });
    await user.click(screen.getByRole("checkbox", { name: "Snap to grid" }));
    fireEvent.pointerMove(move, { pointerId: 2, clientX: 2000, clientY: 2000 });
    fireEvent.pointerUp(move, { pointerId: 2 });
    // Free movement still stops at the canvas edge.
    expect(saved()).toEqual({ x: 538, y: 204, width: 1382, height: 876 });
  });

  it("resizes proportionally with the pointer and restores the box when Escape cancels the drag", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole("checkbox", { name: "Snap to grid" }));
    await user.click(screen.getByRole("checkbox", { name: "Snap to alignment" }));
    const resize = screen.getByRole("button", { name: "Resize video box" });
    fireEvent.pointerDown(resize, { pointerId: 3, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(resize, { pointerId: 3, clientX: 450, clientY: 500 });
    expect(saved()).toEqual({ x: 269, y: 140, width: 1311, height: 831 });
    fireEvent.pointerMove(resize, { pointerId: 3, clientX: 900, clientY: 900 });
    // Stops where the box meets the bottom edge, keeping its proportions.
    expect(saved()).toEqual({ x: 269, y: 140, width: 1483, height: 940 });
    fireEvent.keyDown(resize, { key: "Escape" });
    expect(saved()).toEqual(createDefaultVideosLayout());
    fireEvent.pointerMove(resize, { pointerId: 3, clientX: 100, clientY: 100 });
    expect(saved()).toEqual(createDefaultVideosLayout());
  });

  it("adjusts exactly with arrow keys and fields, rejecting values that leave the canvas", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const move = screen.getByRole("button", { name: "Move video box" });
    fireEvent.keyDown(move, { key: "ArrowRight" });
    fireEvent.keyDown(move, { key: "ArrowDown", shiftKey: true });
    expect(saved()).toMatchObject({ x: 270, y: 150 });
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize video box" }), { key: "ArrowLeft", shiftKey: true });
    expect(saved()).toMatchObject({ width: 1372, height: 876 });
    const x = screen.getByLabelText("Video X (px)");
    await user.clear(x); await user.type(x, "600{Enter}");
    expect(x).toHaveAccessibleDescription("Enter a whole number from 0 to 548.");
    expect(saved().x).toBe(270);
    await user.clear(x); await user.type(x, "0{Enter}");
    const height = screen.getByLabelText("Video height (px)");
    await user.clear(height); await user.type(height, "100{Enter}");
    expect(height).toHaveAccessibleDescription("Enter a whole number from 180 to 930.");
    await user.clear(height); await user.type(height, "360{Enter}");
    expect(saved()).toEqual({ x: 0, y: 150, width: 1372, height: 360 });
    await user.click(screen.getByRole("button", { name: "Reset to default placement" }));
    expect(saved()).toEqual(createDefaultVideosLayout());
  });

  it("ignores gestures and keys while saving", () => {
    render(<Fixture disabled />);
    const move = screen.getByRole("button", { name: "Move video box" });
    expect(move).toBeDisabled();
    expect(screen.getByLabelText("Video width (px)")).toBeDisabled();
    fireEvent.pointerDown(move, { pointerId: 4, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(move, { pointerId: 4, clientX: 50, clientY: 50 });
    fireEvent.keyDown(move, { key: "ArrowRight" });
    expect(saved()).toEqual(createDefaultVideosLayout());
  });
});
