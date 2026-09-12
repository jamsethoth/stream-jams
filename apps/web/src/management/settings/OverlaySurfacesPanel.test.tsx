import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { SurfaceSettingsView } from "@stream-jams/core";
import { OverlaySurfacesPanel } from "./OverlaySurfacesPanel.js";
import type { SurfaceSettingsApi } from "./overlay-surfaces-api.js";
import { createRef } from "react";
import type { OverlaySurfacesPanelHandle } from "./OverlaySurfacesPanel.js";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function harness() {
  let view: SurfaceSettingsView = { surfaces: [
    { id: "desktop:primary", kind: "desktop", enabled: false, displayId: "one", opacity: 1, layers: [{ moduleId: "alerts", visible: true }, { moduleId: "future", visible: false }] },
    { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "future", visible: true }, { moduleId: "alerts", visible: true }] }
  ], desktop: { available: true, state: "disabled", message: null, displays: [{ id: "one", label: "Main monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] } };
  const api = { load: vi.fn<SurfaceSettingsApi["load"]>(async () => structuredClone(view)), save: vi.fn<SurfaceSettingsApi["save"]>(async value => { view = { ...view, surfaces: view.surfaces.map(surface => surface.id === value.id ? value : surface) }; return structuredClone(view); }), retry: vi.fn<SurfaceSettingsApi["retry"]>(async () => structuredClone(view)) };
  return { api, get view() { return view; }, set view(value: SurfaceSettingsView) { view = value; } };
}
it("keeps local independent drafts and explicitly saves only the selected surface", async () => {
  const { api } = harness(); const user = userEvent.setup(); render(<OverlaySurfacesPanel api={api} />);
  await user.click(await screen.findByRole("checkbox", { name: "Enable desktop overlay" }));
  await user.click(screen.getByRole("checkbox", { name: "Show alerts on Unified browser: default" }));
  expect(api.save).not.toHaveBeenCalled(); expect(api.retry).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save Desktop overlay" }));
  expect(api.save).toHaveBeenCalledTimes(1); expect(api.save.mock.calls[0]![0]).toMatchObject({ kind: "desktop", enabled: true });
  expect(screen.getByRole("checkbox", { name: "Show alerts on Unified browser: default" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Save Unified browser: default" })).toBeEnabled();
});
it("provides keyboard ordering and sends the complete top-first row list", async () => {
  const { api } = harness(); const user = userEvent.setup(); render(<OverlaySurfacesPanel api={api} />);
  const up = await screen.findByRole("button", { name: "Move future up on Desktop overlay" }); up.focus(); await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "Save Desktop overlay" }));
  expect(api.save.mock.calls[0]![0].layers).toEqual([{ moduleId: "future", visible: false }, { moduleId: "alerts", visible: true }]);
});
it("preserves a failed-save draft and reports actionable failure", async () => {
  const { api } = harness(); api.save.mockRejectedValueOnce(new Error("Service offline")); const user = userEvent.setup(); render(<OverlaySurfacesPanel api={api} />);
  await user.click(await screen.findByRole("checkbox", { name: "Enable desktop overlay" })); await user.click(screen.getByRole("button", { name: "Save Desktop overlay" }));
  expect(await screen.findByText("Overlay settings were not saved")).toBeVisible(); expect(screen.getByRole("checkbox", { name: "Enable desktop overlay" })).toBeChecked();
});
it("keeps desktop unavailable in CLI while unified controls remain editable", async () => {
  const state = harness(); state.view = { ...state.view, desktop: { available: false, displays: [], state: "unavailable", message: "Use Windows desktop." } };
  render(<OverlaySurfacesPanel api={state.api} />);
  expect(await screen.findByRole("checkbox", { name: "Enable desktop overlay" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Show alerts on Unified browser: default" })).toBeEnabled(); expect(screen.getByText("Use Windows desktop.")).toBeVisible();
});
it("refreshes capabilities while preserving dirty drafts and retains stale state on refresh failure", async () => {
  vi.useFakeTimers(); const state = harness(); render(<OverlaySurfacesPanel api={state.api} />); await act(async () => {});
  fireEvent.click(screen.getByRole("checkbox", { name: "Enable desktop overlay" }));
  state.view = { ...state.view, desktop: { ...state.view.desktop, state: "unavailable", message: "Selected monitor disconnected." } };
  await act(() => vi.advanceTimersByTimeAsync(5000)); expect(screen.getByText("Selected monitor disconnected.")).toBeVisible(); expect(screen.getByRole("checkbox", { name: "Enable desktop overlay" })).toBeChecked();
  state.api.load.mockRejectedValueOnce(new Error("offline")); await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByText("Overlay status could not be refreshed")).toBeVisible(); expect(screen.getByText("Selected monitor disconnected.")).toBeVisible();
});
it("retries only saved desktop settings without saving the draft", async () => {
  const state = harness(); state.view.surfaces[0] = { ...state.view.surfaces[0]!, kind: "desktop", id: "desktop:primary", enabled: true, displayId: "one", opacity: 1 };
  const user = userEvent.setup(); render(<OverlaySurfacesPanel api={state.api} />); const opacity = await screen.findByRole("spinbutton", { name: "Desktop opacity" });
  fireEvent.change(opacity, { target: { value: "0.5" } }); await user.click(screen.getByRole("button", { name: "Retry desktop output" }));
  expect(state.api.retry).toHaveBeenCalledOnce(); expect(state.api.save).not.toHaveBeenCalled(); expect(opacity).toHaveValue(0.5);
  expect(screen.getByText(/Retry uses saved desktop settings/)).toBeVisible();
});
it("keeps the missing saved display selected without falling back", async () => {
  const state = harness(); state.view.desktop.displays = []; render(<OverlaySurfacesPanel api={state.api} />);
  const display = await screen.findByRole("combobox", { name: "Desktop display" }); expect(display).toHaveValue("one"); expect(within(display).getByRole("option", { name: "one (missing)" })).toBeInTheDocument();
});
it("exposes save/discard and dirty notification for the parent Settings guard", async () => {
  const { api } = harness(); const ref = createRef<OverlaySurfacesPanelHandle>(); const dirty = vi.fn(); const user = userEvent.setup();
  render(<OverlaySurfacesPanel api={api} ref={ref} manageNavigation={false} onDirtyChange={dirty} />);
  await user.click(await screen.findByRole("checkbox", { name: "Enable desktop overlay" })); expect(dirty).toHaveBeenLastCalledWith(true);
  await act(async () => { expect(await ref.current?.save()).toBe(true); }); expect(api.save).toHaveBeenCalledOnce(); expect(dirty).toHaveBeenLastCalledWith(false);
  await user.click(screen.getByRole("checkbox", { name: "Enable desktop overlay" })); act(() => ref.current?.discard());
  expect(screen.getByRole("checkbox", { name: "Enable desktop overlay" })).toBeChecked(); expect(dirty).toHaveBeenLastCalledWith(false);
});
it("ignores an older poll response that arrives after an explicit save", async () => {
  vi.useFakeTimers(); const state = harness(); const old = structuredClone(state.view); let loaded!: (value: SurfaceSettingsView) => void;
  render(<OverlaySurfacesPanel api={state.api} />); await act(async () => {});
  state.api.load.mockImplementationOnce(() => new Promise(resolve => { loaded = resolve; })); await act(() => vi.advanceTimersByTimeAsync(5000));
  fireEvent.click(screen.getByRole("checkbox", { name: "Enable desktop overlay" })); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Desktop overlay" })); });
  await act(async () => loaded(old)); expect(screen.getByRole("checkbox", { name: "Enable desktop overlay" })).toBeChecked(); expect(screen.getByRole("button", { name: "Save Desktop overlay" })).toBeDisabled();
});
it("shows a warning when settings save but desktop runtime remains failed", async () => {
  const state = harness(); state.view.desktop.state = "failed"; state.view.desktop.message = "Use Retry to restore future alerts.";
  const user = userEvent.setup(); render(<OverlaySurfacesPanel api={state.api} />);
  await user.click(await screen.findByRole("checkbox", { name: "Enable desktop overlay" })); await user.click(screen.getByRole("button", { name: "Save Desktop overlay" }));
  expect(await screen.findByText("Desktop settings saved; output needs attention.")).toBeVisible(); expect(screen.getByText("Warning")).toBeVisible();
});
it("pauses polling while hidden, refreshes on visibility, and stops after unmount", async () => {
  vi.useFakeTimers(); const { api } = harness(); const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const mounted = render(<OverlaySurfacesPanel api={api} />); await act(async () => {}); expect(api.load).toHaveBeenCalledOnce();
  visibility.mockReturnValue("hidden"); await act(() => vi.advanceTimersByTimeAsync(10000)); expect(api.load).toHaveBeenCalledOnce();
  visibility.mockReturnValue("visible"); await act(async () => { document.dispatchEvent(new Event("visibilitychange")); }); expect(api.load).toHaveBeenCalledTimes(2);
  mounted.unmount(); await act(() => vi.advanceTimersByTimeAsync(10000)); expect(api.load).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
