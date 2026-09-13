import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { SurfaceSettingsView } from "@stream-jams/core";
import { OverlaySurfacesPanel } from "./OverlaySurfacesPanel.js";
import type { SurfaceSettingsApi } from "./overlay-surfaces-api.js";

function view(): SurfaceSettingsView {
  return { surfaces: [
    { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "display-left", opacity: 0.85, layers: [{ moduleId: "alerts", visible: true }, { moduleId: "future-module", visible: false }] },
    { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "future-module", visible: false }, { moduleId: "alerts", visible: true }] }
  ], desktop: { available: true, state: "ready", message: null, displays: [
    { id: "display-left", label: "Left monitor — 2560 × 1440", bounds: { x: -2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.25 },
    { id: "display-main", label: "Main monitor — 1920 × 1080", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ] } };
}
function api(initial = view(), overrides: Partial<SurfaceSettingsApi> = {}): SurfaceSettingsApi {
  let saved = structuredClone(initial);
  return {
    load: fn(async () => structuredClone(saved)),
    save: fn(async value => { saved = { ...saved, surfaces: saved.surfaces.map(surface => surface.id === value.id ? value : surface) }; return structuredClone(saved); }),
    retry: fn(async () => structuredClone(saved)), ...overrides
  };
}
const meta = { title: "Management/Settings/Overlay surfaces", component: OverlaySurfacesPanel, args: { api: api() }, parameters: { layout: "padded" } } satisfies Meta<typeof OverlaySurfacesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DesktopAndUnifiedLayers: Story = {};
export const IndependentDrafts: Story = {
  args: { api: api() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Move future-module up on Desktop overlay" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show alerts on Unified browser: default" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Desktop overlay" }));
    await expect(canvas.getByRole("button", { name: "Save Unified browser: default" })).toBeEnabled();
    await expect(canvas.getByRole("checkbox", { name: "Show alerts on Unified browser: default" })).not.toBeChecked();
  }
};
export const CliUnavailable: Story = { args: { api: api({ ...view(), desktop: { available: false, displays: [], state: "unavailable", message: "Desktop output requires the Windows desktop application. Unified browser settings remain available." } }) } };
export const MissingDisplay: Story = { args: { api: api({ ...view(), desktop: { ...view().desktop, displays: [], state: "unavailable", message: "The saved left display is disconnected. Select a connected display and save; output will not fall back automatically." } }) } };
export const Loading: Story = { args: { api: api(view(), { load: async () => new Promise(() => {}) }) } };
export const LoadFailure: Story = { args: { api: api(view(), { load: async () => { throw new Error("The local service is unavailable."); } }) } };
export const SavedButRuntimeFailed: Story = {
  args: { api: api({ ...view(), desktop: { ...view().desktop, state: "failed", message: "Settings were saved, but the desktop renderer failed. Use Retry to restore future alerts." } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Move future-module up on Desktop overlay" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Desktop overlay" }));
    await expect(await canvas.findByText("Desktop settings saved; output needs attention.")).toBeVisible();
  }
};
export const Empty: Story = { args: { api: api({ ...view(), surfaces: [] }) } };
