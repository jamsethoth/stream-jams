import { createDefaultVideosLayout, type VideosLayout } from "@stream-jams/core";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderManagement as render } from "../../test-support/render-management.js";
import { VideoPlacementEditor, type VideoPlacementEditorHandle } from "./VideoPlacementEditor.js";

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
  it("reports a typed invalid-draft flag and focuses the first invalid field on request", async () => {
    const user = userEvent.setup();
    const onInvalidDraftChange = vi.fn();
    const handle = createRef<VideoPlacementEditorHandle>();
    render(<VideoPlacementEditor ref={handle} value={createDefaultVideosLayout()} onChange={vi.fn()} onInvalidDraftChange={onInvalidDraftChange} />);
    expect(onInvalidDraftChange).not.toHaveBeenCalled();
    const height = screen.getByLabelText("Video content height (px)");
    const y = screen.getByLabelText("Desktop Video Y (px)");
    fireEvent.change(y, { target: { value: "" } });
    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(height, { target: { value: "12.5" } });
    expect(onInvalidDraftChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Reset desktop placement" }));
    act(() => handle.current!.focusFirstInvalid());
    expect(height).toHaveFocus();
    expect(height).toHaveAccessibleDescription("Enter a whole number from 180 to 1080.");
    fireEvent.change(height, { target: { value: String(createDefaultVideosLayout().content.height) } });
    fireEvent.change(y, { target: { value: "0" } });
    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(false);
  });

  it("resets placement to a valid footprint for full-scene content without altering content", async () => {
    const user = userEvent.setup();
    render(<Fixture initial={{ schemaVersion: 2, content: { width: 1920, height: 1080 }, desktopPlacement: { x: 0, y: 0, scale: 1 } }} />);
    await user.click(screen.getByRole("button", { name: "Reset desktop placement" }));
    expect(saved()).toEqual({ schemaVersion: 2, content: { width: 1920, height: 1080 }, desktopPlacement: { x: 0, y: 0, scale: 1 } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("previews the unchanged desktop box and separate content dimensions", () => {
    render(<Fixture />);
    expect(screen.getByTestId("video-placement-preview")).toHaveStyle({ left: "269px", top: "140px", width: "1382px", height: "876px", transform: "scale(1)" });
    expect(screen.getByTestId("video-placement-preview").querySelector(".video-overlay__frame")).toHaveStyle({ width: "1382px", height: "777.375px" });
    expect(screen.getByLabelText("Video content width (px)")).toHaveValue(1382);
    expect(screen.getByLabelText("Desktop Video scale")).toHaveValue(1);
  });
  it("snaps desktop movement without editing content, and clamps at the scene edge", async () => {
    const user = userEvent.setup(); render(<Fixture />);
    const move = screen.getByRole("button", { name: "Move video box" });
    fireEvent.pointerDown(move, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 103, clientY: 101 });
    expect(saved()).toEqual(createDefaultVideosLayout());
    expect(document.querySelector("[data-snap-axis='x']")).toHaveAttribute("data-snap-position", "960");
    fireEvent.pointerUp(move, { pointerId: 1 }); expect(document.querySelector("[data-snap-axis]")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Snap to alignment" }));
    fireEvent.pointerDown(move, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 2, clientX: 103, clientY: 101 });
    expect(saved().desktopPlacement).toEqual({ x: 280, y: 140, scale: 1 });
    await user.click(screen.getByRole("checkbox", { name: "Snap to grid" }));
    fireEvent.pointerMove(move, { pointerId: 2, clientX: 2000, clientY: 2000 }); fireEvent.pointerUp(move, { pointerId: 2 });
    expect(saved()).toEqual({ schemaVersion: 2, content: { width: 1382, height: 876 }, desktopPlacement: { x: 538, y: 204, scale: 1 } });
  });
  it("scales only desktop proportions and restores on Escape or pointer cancellation", async () => {
    const user = userEvent.setup(); render(<Fixture />);
    await user.click(screen.getByRole("checkbox", { name: "Snap to grid" })); await user.click(screen.getByRole("checkbox", { name: "Snap to alignment" }));
    const resize = screen.getByRole("button", { name: "Scale desktop video box" });
    fireEvent.pointerDown(resize, { pointerId: 3, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(resize, { pointerId: 3, clientX: 450, clientY: 500 });
    expect(saved().content).toEqual({ width: 1382, height: 876 }); expect(saved().desktopPlacement.scale).toBeCloseTo(0.9483808314346543, 12);
    fireEvent.pointerMove(resize, { pointerId: 3, clientX: 900, clientY: 900 });
    expect(saved().desktopPlacement.scale).toBeCloseTo(940 / 876, 12);
    fireEvent.keyDown(resize, { key: "Escape" }); expect(saved()).toEqual(createDefaultVideosLayout());
    fireEvent.pointerDown(resize, { pointerId: 4, clientX: 500, clientY: 500 }); fireEvent.pointerMove(resize, { pointerId: 4, clientX: 450, clientY: 500 });
    fireEvent.pointerCancel(resize, { pointerId: 4 }); expect(saved()).toEqual(createDefaultVideosLayout());
  });
  it("edits content explicitly, keeps numeric errors associated, and resets placement independently", async () => {
    const user = userEvent.setup(); render(<Fixture />);
    const width = screen.getByLabelText("Video content width (px)");
    await user.clear(width); await user.type(width, "240{Enter}");
    const height = screen.getByLabelText("Video content height (px)");
    await user.clear(height); await user.type(height, "100{Enter}");
    expect(height).toHaveAccessibleDescription("Enter a whole number from 180 to 1080.");
    expect(saved().content.height).toBe(876);
    await user.clear(height); await user.type(height, "180{Enter}");
    const scale = screen.getByLabelText("Desktop Video scale"); await user.clear(scale); await user.type(scale, "0.5{Enter}");
    const move = screen.getByRole("button", { name: "Move video box" }); fireEvent.keyDown(move, { key: "ArrowRight" }); fireEvent.keyDown(move, { key: "ArrowDown", shiftKey: true });
    expect(saved().desktopPlacement).toEqual({ x: 270, y: 150, scale: 0.5 });
    fireEvent.keyDown(screen.getByRole("button", { name: "Scale desktop video box" }), { key: "ArrowLeft", shiftKey: true });
    expect(saved().desktopPlacement.scale).toBeCloseTo(0.5 - 10 / 240, 12);
    expect(saved().content).toEqual({ width: 240, height: 180 });
    await user.click(screen.getByRole("button", { name: "Reset desktop placement" }));
    expect(saved()).toEqual({ schemaVersion: 2, content: { width: 240, height: 180 }, desktopPlacement: { x: 269, y: 140, scale: 1 } });
    await user.click(screen.getByRole("button", { name: "Reset content and placement" })); expect(saved()).toEqual(createDefaultVideosLayout());
  });
  it("ignores gestures and keys while saving", () => {
    render(<Fixture disabled />); const move = screen.getByRole("button", { name: "Move video box" });
    expect(move).toBeDisabled(); expect(screen.getByLabelText("Video content width (px)")).toBeDisabled();
    fireEvent.pointerDown(move, { pointerId: 4, clientX: 0, clientY: 0 }); fireEvent.pointerMove(move, { pointerId: 4, clientX: 50, clientY: 50 }); fireEvent.keyDown(move, { key: "ArrowRight" });
    expect(saved()).toEqual(createDefaultVideosLayout());
  });
  it("edits the picture shadow in a collapsed section, previews it and keeps it on content reset", async () => {
    const user = userEvent.setup(); render(<Fixture />);
    const frame = () => screen.getByTestId("video-placement-preview").querySelector(".video-overlay__frame")!;
    expect(saved()).not.toHaveProperty("shadow");
    await user.click(screen.getByText("Shadow", { selector: "summary" }));
    const blur = screen.getByLabelText("Shadow blur (px)");
    expect(blur).toHaveValue(48);
    await user.clear(blur); await user.type(blur, "12{Enter}");
    expect(saved().shadow).toEqual({ offsetX: 0, offsetY: 18, blur: 12, spread: 0, color: "#00000073" });
    expect(frame()).toHaveStyle({ boxShadow: "0px 18px 12px 0px #00000073" });
    const color = screen.getByLabelText("Shadow color");
    await user.clear(color); await user.type(color, "red{Enter}");
    expect(color).toHaveAccessibleDescription(/Enter an 8-digit RGBA hex color/u);
    expect(saved().shadow?.color).toBe("#00000073");
    await user.selectOptions(screen.getByLabelText("Shadow"), "off");
    expect(saved().shadow).toEqual({ offsetX: 0, offsetY: 18, blur: 12, spread: 0, color: "#00000000" });
    await user.click(screen.getByRole("button", { name: "Reset content and placement" }));
    expect(saved()).toEqual({ ...createDefaultVideosLayout(), shadow: { offsetX: 0, offsetY: 18, blur: 12, spread: 0, color: "#00000000" } });
  });
});
