import { renderManagement as render } from "../../test-support/render-management.js";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDefaultMusicModuleConfig, type MusicModuleConfig, type MusicSnapshot } from "@stream-jams/core";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MusicDesktopPlacement } from "./MusicDesktopPlacement.js";
const snapshot: MusicSnapshot = { providerId: "sample", generation: "sample", revision: 1, track: { id: "song", title: "Title", artists: ["Artist"], album: null, artworkRef: null }, playbackState: "playing", positionMs: 0, durationMs: 1000, observedAtEpochMs: 1000, session: null };
const surfaceApi = { load: async () => ({ surfaces: [], desktop: { available: false, displays: [], state: "unavailable" as const, message: null }, desktopBindingState: "not-needed" as const }) };
const resolver = { resolveAsset: () => null, resolveArtwork: () => null };
function Fixture({ css = false }: { readonly css?: boolean }) {
  const [config, setConfig] = useState(() => { const initial = createDefaultMusicModuleConfig(); if (css) initial.css = { ...initial.css, enabled: true, source: ".sj-title { color: red; }" }; return initial; });
  return <><MusicDesktopPlacement config={config} onChange={setConfig} snapshot={snapshot} now={1000} resolveAsset={resolver} surfaceApi={surfaceApi} /><output data-testid="config">{JSON.stringify(config)}</output></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("edits full and compact desktop positions independently, keeping browser alignment and resetting", async () => {
  const user = userEvent.setup(); render(<Fixture />);
  await screen.findByText(/Desktop overlay: unavailable/u);
  const initial = JSON.parse(screen.getByTestId("config").textContent!) as MusicModuleConfig;
  const handle = screen.getByRole("button", { name: "Move Music widget on desktop overlay" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(screen.getByLabelText("Desktop Music X (px)")).toHaveValue(1);
  fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
  expect(screen.getByLabelText("Desktop Music Y (px)")).toHaveValue(892);
  await user.selectOptions(screen.getByLabelText("Desktop preview view"), "compact");
  expect(screen.getByLabelText("Desktop Music X (px)")).toHaveValue(0);
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  const saved = JSON.parse(screen.getByTestId("config").textContent!) as MusicModuleConfig;
  expect(saved.desktopPlacement.full).toEqual({ x: 1, y: 892 });
  expect(saved.desktopPlacement.compact?.x).toBe(10);
  expect(saved.profiles).toEqual(initial.profiles);
  await user.click(screen.getByRole("button", { name: "Reset desktop placement to alignment" }));
  expect(screen.getByLabelText("Desktop Music X (px)")).toHaveValue(0);
});
it("keeps unavailable output setup visible and disables native positioning under custom CSS", async () => {
  render(<Fixture css />); await screen.findByText(/Desktop overlay: unavailable/u);
  expect(screen.getByRole("link", { name: "Open Overlay settings" })).toHaveAttribute("href", "/manage/settings#overlay-surfaces");
  expect(screen.getByRole("button", { name: "Move Music widget on desktop overlay" })).toBeDisabled();
  expect(screen.getByLabelText("Desktop Music X (px)")).toBeDisabled();
});

it("marks retained desktop status stale on refresh failure and recovers", async () => {
  vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => undefined);
  const status = { surfaces: [], desktop: { available: true, displays: [], state: "ready" as const, message: null }, desktopBindingState: "not-needed" as const };
  const load = vi.fn().mockResolvedValueOnce(status).mockRejectedValueOnce(new Error("Disconnected")).mockResolvedValue(status);
  render(<MusicDesktopPlacement config={createDefaultMusicModuleConfig()} onChange={() => undefined} snapshot={snapshot} now={1000} resolveAsset={resolver} surfaceApi={{ load }} />);
  await act(async () => {}); expect(screen.getByText(/Desktop overlay: ready/u)).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByText(/Desktop status is stale/u)).toBeVisible();
  expect(screen.getByText(/Desktop overlay: ready/u)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Refresh desktop status" })); await act(async () => {});
  expect(screen.queryByText(/Desktop status is stale/u)).toBeNull();
});

it("rescales only desktop output and restores a cancelled drag", async () => {
  render(<Fixture />); await screen.findByText(/Desktop overlay: unavailable/u);
  const initial = JSON.parse(screen.getByTestId("config").textContent!) as MusicModuleConfig;
  const handle = screen.getByRole("button", { name: "Rescale Music widget on desktop overlay" });
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(screen.getByLabelText("Desktop Music scale (%)")).toHaveValue(110);
  const saved = JSON.parse(screen.getByTestId("config").textContent!) as MusicModuleConfig;
  expect(saved.desktopScale).toEqual({ full: 1.1, compact: 1 });
  expect(saved.profiles).toEqual(initial.profiles);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  fireEvent.pointerDown(handle, { pointerId: 4, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(handle, { pointerId: 4, clientX: 150, clientY: 130 });
  fireEvent.keyDown(handle, { key: "Escape" });
  expect(screen.getByLabelText("Desktop Music scale (%)")).toHaveValue(110);
});
