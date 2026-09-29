import { timersOverlayModuleDefinition, type TimerDefinition, type TimerRunState } from "@stream-jams/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { TimersPage } from "./TimersPage.js";
import type { TimersApi } from "./timers-api.js";

afterEach(cleanup);
const definition: TimerDefinition = { id: "mitts", label: "Wear oven mitts", durationMs: 60_000, iconAssetId: null,
  startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] },
  createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" };
function harness(state: TimerRunState | null = null) {
  let definitions: readonly TimerDefinition[] = [definition]; let states: readonly TimerRunState[] = state === null ? [] : [state];
  const api: TimersApi = {
    list: vi.fn(async () => definitions), listStates: vi.fn(async () => states),
    create: vi.fn(async input => { const created = { ...definition, ...input, id: "created" }; definitions = [...definitions, created]; return created; }),
    update: vi.fn(async (_id, input) => ({ ...definition, ...input })), remove: vi.fn(async () => { definitions = []; }),
    command: vi.fn(async (_id, command) => { if (command === "start") states = [{ status: "running", definitionId: definition.id, generation: "g1", snapshot: definition,
      startedAtEpochMs: 1000, endsAtEpochMs: 61_000 }]; return { changed: true, state: states[0] ?? null }; }),
    getModuleConfig: vi.fn(async () => ({ moduleId: "timers", enabled: true, config: structuredClone(timersOverlayModuleDefinition.defaultConfig), updatedAt: definition.updatedAt })),
    saveModuleConfig: vi.fn(async (enabled, config) => ({ moduleId: "timers", enabled, config, updatedAt: definition.updatedAt })),
    getAutomationCredential: vi.fn(async () => ({ configured: false, createdAt: null, rotatedAt: null })),
    rotateAutomationCredential: vi.fn(async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"x".repeat(32)}` })),
    revokeAutomationCredential: vi.fn(async () => {})
  };
  const audioApi = { getStatus: vi.fn(async () => ({ capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false,
    routes: [{ route: { id: "speakers", name: "Speakers", deviceId: "device", deviceLabel: "Speakers", autoFollowDeviceName: false }, state: "ready", automaticBindingState: "not-needed" }] })) } as unknown as AudioApi;
  return { api, audioApi };
}
function renderPage(state: TimerRunState | null = null) {
  const values = harness(state); render(<TimersPage api={values.api} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />); return values;
}

it("loads reusable definitions, creates a timer, and exposes explicit audio destinations", async () => {
  const user = userEvent.setup(); const { api } = renderPage();
  expect(await screen.findByRole("button", { name: /Wear oven mitts/ })).toBeInTheDocument();
  expect(screen.getByLabelText("Browser Source")).toBeChecked(); expect(screen.getByLabelText("Speakers")).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "New timer" })); await user.type(screen.getByLabelText("Name"), "Cat paws");
  await user.clear(screen.getByLabelText("Duration (seconds)")); await user.type(screen.getByLabelText("Duration (seconds)"), "30");
  await user.click(screen.getByRole("button", { name: "Create timer" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ label: "Cat paws", durationMs: 30_000 })));
});

it("discloses active snapshots, applies state-aware controls, and blocks active deletion", async () => {
  const running: TimerRunState = { status: "running", definitionId: definition.id, generation: "g1", snapshot: definition, startedAtEpochMs: 1000, endsAtEpochMs: 61_000 };
  const user = userEvent.setup(); const { api } = renderPage(running);
  expect(await screen.findByText(/Saved edits apply next time/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Pause" })); await waitFor(() => expect(api.command).toHaveBeenCalledWith("mitts", "pause"));
});

it("edits both profile layouts and reveals a one-time automation credential", async () => {
  const user = userEvent.setup(); const { api } = renderPage(); await screen.findByText("Timer stack");
  screen.getByRole("button", { name: "Move timer region" }).focus(); await user.keyboard("{ArrowRight}");
  await user.click(screen.getByRole("tab", { name: "Vertical" })); await user.selectOptions(screen.getByLabelText("Orientation"), "horizontal");
  await user.click(screen.getByRole("button", { name: "Save overlay layout" })); await waitFor(() => expect(api.saveModuleConfig).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "Create credential" }));
  expect(await screen.findByDisplayValue(/^tmr_/)).toBeInTheDocument(); expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
});
