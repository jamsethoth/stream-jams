import type { Meta, StoryObj } from "@storybook/react-vite";
import { timersOverlayModuleDefinition, type TimerDefinition, type TimerRunState } from "@stream-jams/core";
import { expect, userEvent, within } from "storybook/test";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { TimersPage } from "./TimersPage.js";
import type { TimersApi } from "./timers-api.js";

const definition: TimerDefinition = { id: "mitts", label: "Wear oven mitts for the cat paws reward", durationMs: 60_000, iconAssetId: "story-paws",
  startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] },
  createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" };
const audioApi = { getStatus: async () => ({ capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false, routes: [] }) } as unknown as AudioApi;
const assetApi = { getAssetFile: async () => new Blob(["<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6'/></svg>"], { type: "image/svg+xml" }) } as unknown as AssetApi;
const buildApi = (states: readonly TimerRunState[], enabled = true): TimersApi => ({
  list: async () => [definition], listStates: async () => states, create: async input => ({ ...definition, ...input }), update: async (_id, input) => ({ ...definition, ...input }),
  listBrowserSources: async () => [
    { id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "landscape", enabled: true, keyId: "landscape-key", url: "http://127.0.0.1:39187/overlay/modules/timers/live/story-key?profile=landscape", status: "available", connectionState: "connected", lastConnectedAt: definition.updatedAt },
    { id: "module:timers:vertical:live", label: "Timers Vertical Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "vertical", enabled: true, keyId: null, url: null, status: "create-required", connectionState: "never-connected", lastConnectedAt: null }
  ],
  createBrowserSource: async source => source, regenerateBrowserSource: async source => source,
  remove: async () => {}, command: async () => ({ changed: false, state: states[0] ?? null }),
  getModuleConfig: async () => ({ moduleId: "timers", enabled, config: structuredClone(timersOverlayModuleDefinition.defaultConfig), updatedAt: definition.updatedAt }),
  setModuleEnabled: async enabled => enabled,
  saveModuleConfig: async (enabled, config) => ({ moduleId: "timers", enabled, config, updatedAt: definition.updatedAt }),
  getAutomationCredential: async () => ({ configured: false, createdAt: null, rotatedAt: null }),
  rotateAutomationCredential: async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"placeholder".repeat(4)}` }), revokeAutomationCredential: async () => {}
});
const meta = { title: "Management/Timers", component: TimersPage, parameters: { layout: "fullscreen" }, args: {
  assetApi, audioApi, managementApi: {} as AssetLibraryManagementApi, api: buildApi([])
} } satisfies Meta<typeof TimersPage>;
export default meta; type Story = StoryObj<typeof meta>;
export const IdleInventory: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: /Wear oven mitts/u });
  const preview = canvas.getByLabelText("landscape timer preview");
  await expect(within(preview).getByText(definition.label)).toBeVisible();
  await expect(await within(preview).findByRole("img", { name: `${definition.label} icon` })).toBeVisible();
  await expect(within(preview).getAllByRole("img", { name: "Default timer icon" }).length).toBeGreaterThan(0);
  const timerRow = canvas.getByRole("article", { name: `${definition.label} timer` });
  const idleBounds = within(timerRow).getByText("Idle", { exact: true }).getBoundingClientRect();
  const editBounds = within(timerRow).getByRole("button", { name: "Edit" }).getBoundingClientRect();
  await expect(Math.abs((idleBounds.top + idleBounds.height / 2) - (editBounds.top + editBounds.height / 2))).toBeLessThanOrEqual(1);
  await expect(canvas.queryByRole("dialog", { name: "Create timer" })).not.toBeInTheDocument();
  const browserSources = canvas.getByRole("region", { name: "Browser sources" });
  await expect(within(browserSources).getByRole("button", { name: "Expand browser sources" })).toHaveAttribute("aria-expanded", "false");
} };
export const CreatingTimer: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "New timer" }));
  const dialog = canvas.getByRole("dialog", { name: "Create timer" });
  await expect(dialog).toBeVisible();
  const outputLabels = within(dialog).getByRole("group", { name: "Audio outputs" }).querySelectorAll("label");
  for (const label of outputLabels) {
    const checkbox = label.querySelector("input");
    const labelBounds = label.getBoundingClientRect();
    const checkboxBounds = checkbox?.getBoundingClientRect();
    await expect(checkboxBounds).toBeDefined();
    await expect(Math.abs((labelBounds.top + labelBounds.height / 2) - (checkboxBounds!.top + checkboxBounds!.height / 2))).toBeLessThanOrEqual(1);
  }
} };
export const BrowserSourceSetup: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
  const landscape = canvas.getByRole("article", { name: "Landscape browser source" });
  await expect(within(landscape).getByText("Listening now")).toBeVisible();
  await expect(within(landscape).getByText("1920 x 1080")).toBeVisible();
  await userEvent.click(within(landscape).getByRole("button", { name: "Reveal Landscape URL" }));
  await expect(within(landscape).getByRole("button", { name: "Hide Landscape URL" })).toBeVisible();
} };
export const Running: Story = { args: { api: buildApi([{ status: "running", definitionId: definition.id, generation: "run", snapshot: definition, startedAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 60_000 }]) } };
export const ModuleDisabled: Story = { args: { api: buildApi([], false) }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText("Module disabled")).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Enable Timers module" })).toBeVisible();
} };
export const Paused: Story = { args: { api: buildApi([{ status: "paused", definitionId: definition.id, generation: "pause", snapshot: definition, remainingMs: 30_000 }]) } };
export const Completed: Story = { args: { api: buildApi([{ status: "completed", definitionId: definition.id, generation: "done", snapshot: definition, completedAtEpochMs: Date.now(), expiresAtEpochMs: Date.now() + 3000 }]) } };
