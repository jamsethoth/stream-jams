import { ManagementHttpError } from "../management-http-client.js";
import { renderManagement as render } from "../../test-support/render-management.js";
import { createTestMediaPreviewApi } from "../../test-support/media-preview-fixture.js";
import { timersOverlayModuleDefinition, type AssetLibraryItem, type TimerDefinition, type TimerRunState } from "@stream-jams/core";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { TimersPage } from "./TimersPage.js";
import type { TimersApi } from "./timers-api.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
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
    adjust: async () => ({ changed: false, state: null }), command: vi.fn(async (_id, command) => { if (command === "start") states = [{ status: "running", definitionId: definition.id, generation: "g1", snapshot: definition,
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
  const values = harness(state); const view = render(<TimersPage api={values.api} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />); return { ...values, view };
}

it("announces command outcomes once with fixed expiry, dismissal and typed diagnostics", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const values = harness();
  const command = vi.fn().mockResolvedValueOnce({ changed: true, state: null }).mockRejectedValue(new ManagementHttpError("Unavailable", "UNAVAILABLE", "fixture-timer-ref", "Restart the local service."));
  render(<TimersPage api={{ ...values.api, command }} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await act(async () => {});
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveClass("management-toast");
  expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(3999); });
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await act(async () => {});
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").closest(".management-toast")).toHaveClass("management-toast--failure");
  expect(screen.getByRole("alert")).toHaveTextContent("Restart the local service.");
  expect(screen.getByRole("link", { name: "Open Diagnostics" })).toHaveAttribute("href", "/manage/diagnostics?reference=fixture-timer-ref");
  await act(async () => { await vi.advanceTimersByTimeAsync(7999); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps initial-load failure inline beyond toast expiry", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const values = harness();
  render(<TimersPage api={{ ...values.api, list: async () => { throw new ManagementHttpError("Read failed", "UNAVAILABLE", "fixture-load-ref", "Restart the service."); } }} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />);
  await act(async () => {});
  expect(screen.getByRole("alert")).toHaveTextContent("Timers could not be loaded");
  expect(screen.getByRole("alert").closest(".management-toast")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(screen.getByRole("alert")).toHaveTextContent("fixture-load-ref");
});

it("keeps failed command feedback inside the open dialog and clears its lifetime on close", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  const values = harness({ status: "paused", definitionId: definition.id, generation: "fixture", snapshot: definition, remainingMs: 60000 });
  render(<TimersPage api={{ ...values.api, adjust: async () => { throw new ManagementHttpError("Unavailable", "UNAVAILABLE", "fixture-dialog-ref", "Restart the service."); } }} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />);
  await user.click(await screen.findByRole("button", { name: /Wear oven mitts/ }));
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  const dialog = screen.getByRole("dialog", { name: "Edit Wear oven mitts" });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("fixture-dialog-ref");
  const dismiss = within(dialog).getByRole("button", { name: "Dismiss error" });
  dismiss.focus();
  expect(dismiss).toHaveFocus();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Wear oven mitts/ }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps invalid timer definition and layout correction inline without issuing commands", async () => {
  const user = userEvent.setup();
  const values = harness();
  render(<TimersPage api={values.api} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />);
  await user.click(await screen.findByRole("button", { name: "New timer" }));
  const dialog = screen.getByRole("dialog", { name: "Create timer" });
  fireEvent.submit(within(dialog).getByRole("button", { name: "Create timer" }).closest("form")!);
  expect(within(dialog).getByRole("alert").closest(".management-toast")).toBeNull();
  expect(values.api.create).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum shown" }), { target: { value: "99" } });
  await user.click(screen.getByRole("button", { name: "Save overlay layout" }));
  expect(screen.getByRole("alert").closest(".management-toast")).toBeNull();
  expect(values.api.saveModuleConfig).not.toHaveBeenCalled();
});

it("retains correction input after a failed request and permits an explicit retry", async () => {
  const user = userEvent.setup();
  const values = harness({ status: "paused", definitionId: "mitts", generation: "g1", snapshot: definition, remainingMs: 60000 });
  const adjust = vi.fn().mockRejectedValueOnce(new Error("Check the local service and retry.")).mockResolvedValue({ changed: true, state: null });
  render(<TimersPage api={{ ...values.api, adjust }} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} />);
  await user.click(await screen.findByRole("button", { name: /Wear oven mitts/ }));
  await user.clear(screen.getByLabelText("Time (seconds)")); await user.type(screen.getByLabelText("Time (seconds)"), "42");
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the local service and retry.");
  expect(screen.getByLabelText("Time (seconds)")).toHaveValue(42);
  expect(screen.getByRole("button", { name: "Apply adjustment" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(adjust).toHaveBeenNthCalledWith(2, "mitts", { action: "increment", amountMs: 42000 });
});

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

it("opens the owning timer after definitions load from an asset usage link", async () => {
  const values = harness();
  render(<TimersPage api={values.api} assetApi={{} as AssetApi} audioApi={values.audioApi} managementApi={{} as AssetLibraryManagementApi} ownerId="mitts" />);
  expect(await screen.findByRole("dialog", { name: "Edit Wear oven mitts" })).toBeVisible();
  expect(screen.getByLabelText("Name")).toHaveValue("Wear oven mitts");
});

it("selects a GIF icon from compatible assets and saves its stable ID", async () => {
  const user = userEvent.setup(); const values = harness();
  const gif: AssetLibraryItem = { id: "paws-gif", displayName: "Animated paws", originalFileName: "paws.gif", mediaType: "gif", mimeType: "image/gif", sizeBytes: 12,
    width: null, height: null, durationMs: null, health: "missing", tags: [], createdAt: definition.createdAt, updatedAt: definition.updatedAt,
    usage: { assetId: "paws-gif", totalUsageCount: 0, usages: [] } };
  const managementApi = { listAssetLibraryItems: async () => [gif] } as unknown as AssetLibraryManagementApi;
  const assetApi = createTestMediaPreviewApi() as unknown as AssetApi;
  render(<TimersPage api={values.api} assetApi={assetApi} audioApi={values.audioApi} managementApi={managementApi} />);
  await user.click(await screen.findByRole("button", { name: /Wear oven mitts/ }));
  await user.click(screen.getAllByRole("button", { name: "Choose" })[0]!);
  expect(await screen.findByRole("button", { name: "Animated paws, gif, 0 uses" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Use selected asset" }));
  await user.click(screen.getByRole("button", { name: "Save timer" }));
  await waitFor(() => expect(values.api.update).toHaveBeenCalledWith("mitts", expect.objectContaining({ iconAssetId: "paws-gif" })));
});

it("requires confirmation before rotating an existing automation credential", async () => {
  const user = userEvent.setup(); const { api } = renderPage();
  await user.click(await screen.findByRole("button", { name: "Create credential" }));
  await user.click(await screen.findByRole("button", { name: "Rotate credential" }));
  let dialog = screen.getByRole("dialog", { name: "Rotate timer automation credential?" });
  expect(within(dialog).getByText(/Existing Stream Deck actions will stop working/)).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api.rotateAutomationCredential).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Rotate credential" }));
  dialog = screen.getByRole("dialog", { name: "Rotate timer automation credential?" });
  await user.click(within(dialog).getByRole("button", { name: "Confirm rotation" }));
  await waitFor(() => expect(api.rotateAutomationCredential).toHaveBeenCalledTimes(2));
});

it("polls runtime state without overwriting edits and retains stale state until recovery", async () => {
  vi.useFakeTimers();
  const { api, view } = renderPage();
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Wear oven mitts/ }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved name" } });
  const running: TimerRunState = { status: "running", definitionId: definition.id, generation: "external", snapshot: definition, startedAtEpochMs: 1000, endsAtEpochMs: 61_000 };
  vi.mocked(api.listStates).mockResolvedValueOnce([running]).mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValueOnce([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved name");
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByText("Timer status is stale")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.queryByText("Timer status is stale")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  expect(api.list).toHaveBeenCalledTimes(1);
  const polls = vi.mocked(api.listStates).mock.calls.length;
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(api.listStates).toHaveBeenCalledTimes(polls);
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
  await user.click(screen.getByRole("radio", { name: "Vertical" })); await user.selectOptions(screen.getByLabelText("Orientation"), "horizontal");
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
