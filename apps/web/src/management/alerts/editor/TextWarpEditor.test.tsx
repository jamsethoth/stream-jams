import { renderManagement as render } from "../../../test-support/render-management.js";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDefaultTextWarp, insertTextWarpSplit, type AlertTextWarp } from "@stream-jams/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextWarpEditor } from "./TextWarpEditor.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(initial = createDefaultTextWarp()) {
  const commit = vi.fn(); const preview = vi.fn(); const done = vi.fn();
  function Harness() { const [warp, setWarp] = useState<AlertTextWarp>(initial); return <TextWarpEditor warp={warp} onCommit={(next) => { commit(next); setWarp(next); }} onPreview={preview} onDone={done} />; }
  const { container } = render(<Harness />);
  const surface = container.querySelector<HTMLDivElement>(".text-warp-editor")!;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  return { surface, commit, preview, done };
}
describe("TextWarpEditor", () => {
  it("rejects nearby splits, then adds handles supporting keyboard/numeric editing and removal", async () => {
    const { surface, commit } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add vertical split" }));
    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 });
    expect(screen.getByRole("status")).toHaveTextContent("farther from existing lines");
    expect(commit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add vertical split" }));
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    expect(screen.getAllByRole("button", { name: /Warp handle/ })).toHaveLength(12);
    const handle = screen.getByRole("button", { name: "Warp handle 2, 2" });
    fireEvent.focus(handle); fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(commit.mock.lastCall?.[0].points[5].x).toBeCloseTo(.3);
    fireEvent.change(screen.getByLabelText("Warp handle X"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Warp handle Y"), { target: { value: "75" } });
    expect(commit.mock.lastCall?.[0].points[5]).toEqual({ x: .4, y: .75 });
    await user.click(screen.getByRole("button", { name: "Remove column" }));
    expect(screen.getAllByRole("button", { name: /Warp handle/ })).toHaveLength(9);
    await user.click(screen.getByRole("button", { name: "Reset warp" }));
    expect(commit).toHaveBeenLastCalledWith(createDefaultTextWarp());
  });
  it("previews a pointer drag and commits exactly once on release", () => {
    const { commit, preview } = setup(); const handle = screen.getByRole("button", { name: "Warp handle 2, 2" });
    Object.assign(handle, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 240, clientY: 80 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 280, clientY: 120 });
    expect(commit).not.toHaveBeenCalled(); expect(preview).toHaveBeenCalledTimes(2);
    fireEvent.pointerUp(handle, { pointerId: 1 }); fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.lastCall?.[0].points[4]).toEqual({ x: .7, y: .6 });
    expect(preview).toHaveBeenLastCalledWith(null);
  });
  it("cancels split mode with Escape and protects outer boundaries", async () => {
    const { surface, commit, done } = setup(insertTextWarpSplit(createDefaultTextWarp(), "horizontal", .25));
    expect(screen.getByRole("button", { name: "Remove row" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add horizontal split" }));
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); expect(done).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(done).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled();
  });
});
