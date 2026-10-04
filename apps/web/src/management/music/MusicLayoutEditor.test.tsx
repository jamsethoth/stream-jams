import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDefaultMusicModuleConfig, projectMusicWidget, type MusicAppearance, type MusicComponentLayout, type MusicSnapshot } from "@stream-jams/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicLayoutEditor } from "./MusicLayoutEditor.js";

const now = 1_000_000;
const snapshot: MusicSnapshot = { providerId: "preview", generation: "fixture", revision: 1, track: { id: "song", title: "Sample title", artists: ["Artist"], album: "Album", artworkRef: null },
  playbackState: "playing", positionMs: 20_000, durationMs: 100_000, observedAtEpochMs: now, session: null };
const resolver = { resolveAsset: () => null, resolveArtwork: () => null };
const box = (x: number, y: number, width: number, height: number): DOMRect => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) });
const boxes: Record<string, DOMRect> = {
  "music-widget-host": box(0, 0, 640, 178), "music-layout-editor__stage": box(0, 0, 640, 178),
  "sj-artwork": box(16, 16, 144, 144), "sj-title": box(182, 24, 300, 36), "sj-details": box(182, 66, 442, 44),
  "sj-progress-track": box(182, 120, 442, 5), "sj-time": box(182, 132, 442, 16)
};
function mockLayoutGeometry() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return Object.entries(boxes).find(([name]) => this.classList.contains(name))?.[1] ?? box(0, 0, 0, 0);
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("music-layout-editor__viewport") ? 700 : 0; });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
}

function Fixture({ css = false }: { readonly css?: boolean }) {
  const [appearance, setAppearance] = useState<MusicAppearance>(() => createDefaultMusicModuleConfig().profiles.landscape.views.full);
  const config = createDefaultMusicModuleConfig();
  config.profiles.landscape.views.full = appearance;
  if (css) config.css = { source: ".sj-title { left: 0 !important; }", enabled: true, styleContractVersion: 1 };
  const projection = projectMusicWidget(snapshot, { state: "connected", stale: false, diagnosticReference: null }, config, "landscape", now, now);
  return <><MusicLayoutEditor appearance={appearance} onChange={setAppearance} projection={projection} resolveAsset={resolver} />
    <output data-testid="saved-layout">{JSON.stringify(appearance.componentLayout)}</output></>;
}

describe("MusicLayoutEditor", () => {
  const pointerCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");
  afterEach(() => {
    cleanup(); vi.restoreAllMocks();
    if (pointerCapture === undefined) Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
    else Object.defineProperty(HTMLElement.prototype, "setPointerCapture", pointerCapture);
  });

  it("seeds exact rendered boxes, mirrors pointer and keyboard edits in numeric fields, cancels and resets", async () => {
    mockLayoutGeometry();
    const user = userEvent.setup();
    render(<Fixture />);
    expect(screen.getByTestId("saved-layout")).toHaveTextContent("null");
    await user.click(screen.getByRole("button", { name: "Edit component layout" }));
    await user.click(screen.getByRole("checkbox", { name: "Snap to grid" }));
    await user.click(screen.getByRole("checkbox", { name: "Snap to alignment" }));
    const saved = () => JSON.parse(screen.getByTestId("saved-layout").textContent ?? "null") as MusicComponentLayout;
    expect(saved().title).toEqual({ x: 182, y: 24, width: 300, height: 36 });
    expect(screen.getByRole("spinbutton", { name: "Title X (px)" })).toHaveValue(182);
    const move = screen.getByRole("button", { name: "Move Title" });
    fireEvent.keyDown(move, { key: "ArrowRight" });
    expect(saved().title.x).toBe(183);
    fireEvent.keyDown(move, { key: "ArrowDown", shiftKey: true });
    expect(saved().title.y).toBe(34);
    fireEvent.pointerDown(move, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 120, clientY: 100 });
    expect(saved().title.x).toBe(203);
    fireEvent.keyDown(move, { key: "Escape" });
    expect(saved().title.x).toBe(183);
    fireEvent.pointerDown(move, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 2, clientX: 110, clientY: 100 });
    fireEvent.pointerCancel(move, { pointerId: 2 });
    expect(saved().title.x).toBe(183);
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Title" }), { key: "ArrowLeft" });
    expect(saved().title.width).toBe(299);
    const xInput = screen.getByRole("spinbutton", { name: "Title X (px)" });
    await user.clear(xInput);
    await user.type(xInput, "170");
    fireEvent.blur(xInput);
    expect(saved().title.x).toBe(170);
    await user.click(screen.getByRole("button", { name: "Reset automatic layout" }));
    expect(screen.getByTestId("saved-layout")).toHaveTextContent("null");
  });

  it("snaps pointer moves and resizes while toggles govern guides and free movement", async () => {
    mockLayoutGeometry();
    const user = userEvent.setup();
    const view = render(<Fixture />);
    await user.click(screen.getByRole("button", { name: "Edit component layout" }));
    const grid = screen.getByRole("checkbox", { name: "Snap to grid" });
    const alignment = screen.getByRole("checkbox", { name: "Snap to alignment" });
    expect(grid).toBeChecked(); expect(alignment).toBeChecked();
    const saved = () => JSON.parse(screen.getByTestId("saved-layout").textContent ?? "null") as MusicComponentLayout;
    const move = screen.getByRole("button", { name: "Move Title" });
    fireEvent.pointerDown(move, { pointerId: 3, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 3, clientX: 106, clientY: 100 });
    expect(saved().title.x).toBe(190);
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
    fireEvent.pointerUp(move, { pointerId: 3 });
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
    fireEvent.pointerDown(move, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 4, clientX: 93, clientY: 100 });
    expect(saved().title.x).toBe(182);
    expect(view.container.querySelector('[data-snap-axis="x"][data-snap-position="182"]')).not.toBeNull();
    fireEvent.pointerCancel(move, { pointerId: 4 });
    expect(saved().title.x).toBe(190);
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
    await user.click(grid); await user.click(alignment);
    fireEvent.pointerDown(move, { pointerId: 5, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 5, clientX: 106, clientY: 100 });
    expect(saved().title.x).toBe(196);
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
    fireEvent.pointerUp(move, { pointerId: 5 });
    await user.click(grid);
    const resize = screen.getByRole("button", { name: "Resize Title" });
    fireEvent.pointerDown(resize, { pointerId: 6, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 6, clientX: 93, clientY: 100 });
    expect(saved().title.x).toBe(196);
    expect(saved().title.width).toBe(294);
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
    fireEvent.pointerUp(resize, { pointerId: 6 });
    expect(view.container.querySelector("[data-snap-axis]")).toBeNull();
  });

  it("warns and disables native handles while custom CSS can override geometry", () => {
    render(<Fixture css />);
    expect(screen.getByRole("button", { name: "Edit component layout" })).toBeDisabled();
    expect(screen.getByText(/Disable custom CSS to edit native component layout/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Title" })).toBeNull();
  });
});
