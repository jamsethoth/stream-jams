import { timersOverlayModuleDefinition, type TimerDefinition, type TimerRunState } from "@stream-jams/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  const setModuleEnabled = vi.fn(async (enabled: boolean) => enabled);
  const api: TimersApi = {
    list: vi.fn(async () => definitions), listStates: vi.fn(async () => states),
    create: vi.fn(async input => { const created = { ...definition, ...input, id: "created" }; definitions = [...definitions, created]; return created; }),
    update: vi.fn(async (_id, input) => ({ ...definition, ...input })), remove: vi.fn(async () => { definitions = []; }),
    command: vi.fn(async (_id, command) => { if (command === "start") states = [{ status: "running", definitionId: definition.id, generation: "g1", snapshot: definition,
      startedAtEpochMs: 1000, endsAtEpochMs: 61_000 }]; return { changed: true, state: states[0] ?? null }; }),
    getModuleConfig: vi.fn(async () => ({ moduleId: "timers", enabled: true, config: structuredClone(timersOverlayModuleDefinition.defaultConfig), updatedAt: definition.updatedAt })),
    setModuleEnabled,
    saveModuleConfig: vi.fn(async (enabled, config) => ({ moduleId: "timers", enabled, config, updatedAt: definition.updatedAt })),
    getAutomationCredential: vi.fn(async () => ({ configured: false, createdAt: null, rotatedAt: null })),
    rotateAutomationCredential: vi.fn(async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"x".repeat(32)}` })),
    revokeAutomationCredential: vi.fn(async () => {}),
    listBrowserSources: vi.fn(async () => [
      { id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live" as const, overlayId: "default", scope: "module" as const,
        moduleId: "timers" as const, targetProfileId: "landscape" as const, enabled: true, keyId: "key-landscape",
        url: "http://127.0.0.1/overlay/modules/timers/live/secret?profile=landscape", status: "available" as const,
        connectionState: "connected" as const, lastConnectedAt: "2026-09-29T01:05:00.000Z" },
      { id: "module:timers:vertical:live", label: "Timers Vertical Live", purpose: "live" as const, overlayId: "default", scope: "module" as const,
        moduleId: "timers" as const, targetProfileId: "vertical" as const, enabled: true, keyId: null, url: null, status: "create-required" as const,
        connectionState: "never-connected" as const, lastConnectedAt: null }
    ]),
    createBrowserSource: vi.fn(async (source: unknown) => source),
    regenerateBrowserSource: vi.fn(async (source: unknown) => source)
  } as unknown as TimersApi;
  const audioApi = { getStatus: vi.fn(async () => ({ capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false,
    routes: [{ route: { id: "speakers", name: "Speakers", deviceId: "device", deviceLabel: "Speakers", autoFollowDeviceName: false }, state: "ready", automaticBindingState: "not-needed" }] })) } as unknown as AudioApi;
  return { api, audioApi, setModuleEnabled };
}
function renderPage(state: TimerRunState | null = null) {
  const values = harness(state); render(<TimersPage api={values.api} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />); return values;
}

it("keeps the timer editor closed until New timer opens the creation dialog", async () => {
  const user = userEvent.setup(); const { api } = renderPage();
  expect(await screen.findByRole("button", { name: /Wear oven mitts/ })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Create timer" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "New timer" }));
  const dialog = screen.getByRole("dialog", { name: "Create timer" });
  expect(within(dialog).getByLabelText("Browser Source")).toBeChecked();
  expect(within(dialog).getByLabelText("Speakers")).not.toBeChecked();
  await user.type(within(dialog).getByLabelText("Name"), "Cat paws");
  await user.clear(within(dialog).getByLabelText("Duration (seconds)")); await user.type(within(dialog).getByLabelText("Duration (seconds)"), "30");
  await user.click(within(dialog).getByRole("button", { name: "Create timer" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ label: "Cat paws", durationMs: 30_000 })));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create timer" })).not.toBeInTheDocument());
});

it("presents profile-aware browser source setup in a collapsed output band", async () => {
  const user = userEvent.setup(); const { api } = renderPage();
  const sources = await screen.findByRole("region", { name: "Browser sources" });
  expect(within(sources).getByText("1 ready")).toBeInTheDocument();
  expect(within(sources).getByText("1 needs setup")).toBeInTheDocument();
  expect(within(sources).queryByRole("article", { name: "Landscape browser source" })).not.toBeInTheDocument();
  await user.click(within(sources).getByRole("button", { name: "Expand browser sources" }));
  expect(within(sources).getByRole("article", { name: "Landscape browser source" })).toBeInTheDocument();
  expect(within(sources).getByRole("article", { name: "Vertical browser source" })).toBeInTheDocument();
  expect(within(sources).getByText("Listening now")).toBeInTheDocument();
  await user.click(within(sources).getByRole("button", { name: "Create Vertical URL" }));
  await waitFor(() => expect(api.createBrowserSource).toHaveBeenCalledWith(expect.objectContaining({ targetProfileId: "vertical" })));
  await user.click(within(sources).getByRole("button", { name: "Regenerate Landscape URL" }));
  const confirmation = screen.getByRole("dialog", { name: "Regenerate Landscape URL?" });
  await user.click(within(confirmation).getByRole("button", { name: "Regenerate URL" }));
  await waitFor(() => expect(api.regenerateBrowserSource).toHaveBeenCalledWith(expect.objectContaining({ targetProfileId: "landscape" })));
});

it("discloses active snapshots, applies state-aware controls, and blocks active deletion", async () => {
  const running: TimerRunState = { status: "running", definitionId: definition.id, generation: "g1", snapshot: definition, startedAtEpochMs: 1000, endsAtEpochMs: 61_000 };
  const user = userEvent.setup(); const { api } = renderPage(running);
  await user.click(await screen.findByRole("button", { name: /Wear oven mitts/ }));
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

it("shows explicit timer module enablement and confirms disabling it", async () => {
  const user = userEvent.setup();
  const { setModuleEnabled } = renderPage();

  expect(await screen.findByText("Module enabled")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Show Timers module" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Disable Timers module" }));
  const dialog = screen.getByRole("dialog", { name: "Disable Timers module?" });
  await user.click(within(dialog).getByRole("button", { name: "Confirm change" }));

  await waitFor(() => expect(setModuleEnabled).toHaveBeenCalledWith(false));
  expect(screen.getByText("Module disabled")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable Timers module" })).toBeInTheDocument();
});
