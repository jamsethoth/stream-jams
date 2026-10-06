import { createTestMediaPreviewApi } from "../../test-support/media-preview-fixture.js";
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
const assetApi = createTestMediaPreviewApi() as unknown as AssetApi;
const buildApi = (states: readonly TimerRunState[], enabled = true): TimersApi => ({
  list: async () => [definition], listStates: async () => states, create: async input => ({ ...definition, ...input }), update: async (_id, input) => ({ ...definition, ...input }),
  listBrowserSources: async () => [
    { id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "landscape", enabled: true, keyId: "landscape-key", url: "http://127.0.0.1:39187/overlay/modules/timers/live/story-key?profile=landscape", status: "available", connectionState: "connected", lastConnectedAt: definition.updatedAt },
    { id: "module:timers:vertical:live", label: "Timers Vertical Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "vertical", enabled: true, keyId: null, url: null, status: "create-required", connectionState: "never-connected", lastConnectedAt: null }
  ],
  createBrowserSource: async source => source, regenerateBrowserSource: async source => source,
  remove: async () => {}, adjust: async () => ({ changed: false, state: null }), command: async () => ({ changed: false, state: states[0] ?? null }),
  getModuleConfig: async () => ({ moduleId: "timers", enabled, config: structuredClone(timersOverlayModuleDefinition.defaultConfig), updatedAt: definition.updatedAt }),
  setModuleEnabled: async enabled => enabled,
  saveModuleConfig: async (enabled, config) => ({ moduleId: "timers", enabled, config, updatedAt: definition.updatedAt }),
  getAutomationCredential: async () => ({ configured: false, createdAt: null, rotatedAt: null }),
  rotateAutomationCredential: async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"placeholder".repeat(4)}` }), revokeAutomationCredential: async () => {}
});
const meta = { tags: ["mantine-stage6d", "stream-local-media", "mantine-feedback-tabs", "mantine-feedback-timers", "mantine-stage5"], title: "Management/Timers", component: TimersPage, parameters: { layout: "fullscreen" }, args: {
  assetApi, audioApi, managementApi: {} as AssetLibraryManagementApi, api: buildApi([])
} } satisfies Meta<typeof TimersPage>;
export default meta; type Story = StoryObj<typeof meta>;
export const IdleInventory: Story = { tags: ["mantine-stage5-identity"], play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: /Wear oven mitts/u });
  const preview = canvas.getByLabelText("landscape timer preview");
  await expect(within(preview).getByText(definition.label)).toBeVisible();
  await expect(await within(preview).findByRole("img", { name: `${definition.label} icon` })).toBeVisible();
  await expect(within(preview).getAllByRole("img", { name: "Default timer icon" }).length).toBeGreaterThan(0);
  const timerRow = canvas.getByRole("article", { name: `${definition.label} timer` });
  const identity = within(timerRow).getByRole("button", { name: /Wear oven mitts/u });
  const identityStyle = getComputedStyle(identity);
  const contentStart = parseFloat(identityStyle.paddingLeft) + parseFloat(identityStyle.borderLeftWidth);
  await expect(Math.abs(within(identity).getByText(definition.label).getBoundingClientRect().left - identity.getBoundingClientRect().left - contentStart)).toBeLessThanOrEqual(1);
  const idleBounds = within(timerRow).getByText("Idle", { exact: true }).getBoundingClientRect();
  const editBounds = within(timerRow).getByRole("button", { name: "Edit" }).getBoundingClientRect();
  await expect(Math.abs((idleBounds.top + idleBounds.height / 2) - (editBounds.top + editBounds.height / 2))).toBeLessThanOrEqual(1);
  await expect(canvas.queryByRole("dialog", { name: "Create timer" })).not.toBeInTheDocument();
  const browserSources = canvas.getByRole("region", { name: "Browser sources" });
  await expect(within(browserSources).getByRole("button", { name: "Expand browser sources" })).toHaveAttribute("aria-expanded", "false");
} };
export const ProfileValueChoice: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: /Wear oven mitts/u });
  await expect(canvas.getByRole("radiogroup", { name: "Timer profile" })).toBeVisible();
  await userEvent.click(canvas.getByRole("radio", { name: "Landscape" }));
  await userEvent.keyboard("{ArrowRight}");
  await expect(canvas.getByRole("radio", { name: "Vertical" })).toBeChecked();
  await expect(canvas.getByLabelText("vertical timer preview")).toBeVisible();
  await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
} };
export const InvalidLayoutCorrection: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: /Wear oven mitts/u });
  const maximum = canvas.getByRole("spinbutton", { name: "Maximum shown" });
  await userEvent.clear(maximum);
  await userEvent.type(maximum, "99");
  await expect(canvas.getByText("Correct the layout values to preview the timer stack.")).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Save overlay layout" }));
  await expect(canvas.getByRole("alert").closest(".management-toast")).toBeNull();
  await expect(maximum).toHaveValue(99);
} };
export const CreatingTimer: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "New timer" }));
  const dialog = await within(document.body).findByRole("dialog", { name: "Create timer" });
  await expect(dialog).toBeVisible();
  const outputs = within(dialog).getByRole("group", { name: "Audio outputs" });
  for (const checkbox of within(outputs).getAllByRole("checkbox")) {
    const label = outputs.querySelector(`label[for="${checkbox.id}"]`)!;
    const labelBounds = label.getBoundingClientRect();
    const checkboxBounds = checkbox.getBoundingClientRect();
    await expect(checkboxBounds).toBeDefined();
    await expect(Math.abs((labelBounds.top + labelBounds.height / 2) - (checkboxBounds.top + checkboxBounds.height / 2))).toBeLessThanOrEqual(1);
  }
  await expect(within(dialog).getByRole("spinbutton", { name: "Duration (seconds)" })).toBeRequired();
  await userEvent.click(within(dialog).getByRole("button", { name: "Add event rule" }));
  const rules = within(dialog).getByRole("group", { name: "Rule 1" });
  await userEvent.selectOptions(within(rules).getByRole("combobox", { name: "Event type" }), "cheer");
  await userEvent.selectOptions(within(rules).getByRole("combobox", { name: "Action" }), "increment");
  const quantity = within(rules).getByRole("spinbutton", { name: "Quantity per adjustment (blank for fixed time)" });
  await userEvent.type(quantity, "10");
  await expect(quantity).toHaveValue(10);
  await userEvent.clear(quantity);
  await expect(quantity).toHaveValue(null);
} };
export const BrowserSourceSetup: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
  const landscape = canvas.getByRole("article", { name: "Landscape browser source" });
  await expect(within(landscape).getByText("Listening now")).toBeVisible();
  for (const dimensions of within(landscape).getAllByText("1920 x 1080")) {
    await expect(dimensions).toBeVisible();
    await expect(dimensions).toHaveAttribute("dir", "ltr");
  }
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
export const CorrectionFailureAndRetry: Story = {
  beforeEach: () => {
    const report = console.error;
    console.error = (...args: unknown[]) => { if (!String(args[0]).includes("Timer action failed")) report(...args); };
    return () => { console.error = report; };
  },
  render: args => {
    let attempts = 0;
    const state: TimerRunState = { status: "paused", definitionId: definition.id, generation: "retry", snapshot: definition, remainingMs: 30000 };
    const api: TimersApi = { ...buildApi([state]), adjust: async () => {
      if (++attempts === 1) throw new Error("Check the local service and retry.");
      return { changed: true, state };
    } };
    return <TimersPage {...args} api={api} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /Wear oven mitts/ }));
    const dialog = within(await within(document.body).findByRole("dialog", { name: `Edit ${definition.label}` }));
    const input = dialog.getByLabelText("Time (seconds)");
    await userEvent.clear(input); await userEvent.type(input, "42");
    await userEvent.click(dialog.getByRole("button", { name: "Apply adjustment" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Check the local service and retry.");
    await expect(input).toHaveValue(42);
    await expect(dialog.getByRole("button", { name: "Apply adjustment" })).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: "Apply adjustment" }));
    await expect(dialog.queryByRole("alert")).not.toBeInTheDocument();
    await expect(dialog.getByText("Timer adjusted.")).toBeInTheDocument();
  }
};
export const Completed: Story = { args: { api: buildApi([{ status: "completed", definitionId: definition.id, generation: "done", snapshot: definition, completedAtEpochMs: Date.now(), expiresAtEpochMs: Date.now() + 3000 }]) } };
export const ConfirmCredentialRotation: Story = {
  args: { api: { ...buildApi([]), getAutomationCredential: async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Rotate credential" }));
    const dialog = await within(document.body).findByRole("dialog", { name: "Rotate timer automation credential?" });
    await expect(within(dialog).getByText(/Existing Stream Deck actions will stop working/)).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
  }
};
