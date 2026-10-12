import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { SurfaceSettingsView } from "@stream-jams/core";
import { OverlaySurfacesPanel } from "./OverlaySurfacesPanel.js";
import type { SurfaceSettingsApi } from "./overlay-surfaces-api.js";

function view(): SurfaceSettingsView {
  return { surfaces: [
    { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "display-left", displayLabel: "Left monitor — 2560 × 1440", autoFollowDisplayName: true, opacity: 0.85, layers: [{ moduleId: "alerts", visible: true }, { moduleId: "future-module", visible: false }] },
    { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "future-module", visible: false }, { moduleId: "alerts", visible: true }] }
  ], desktop: { available: true, state: "ready", message: null, displays: [
    { id: "display-left", label: "Left monitor — 2560 × 1440", bounds: { x: -2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.25 },
    { id: "display-main", label: "Main monitor — 1920 × 1080", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ] }, desktopBindingState: "not-needed" };
}
function api(initial = view(), overrides: Partial<SurfaceSettingsApi> = {}): SurfaceSettingsApi {
  let saved = structuredClone(initial);
  return {
    load: fn(async () => structuredClone(saved)),
    save: fn(async value => { saved = { ...saved, surfaces: saved.surfaces.map(surface => surface.id === value.id ? { ...value, displayLabel: saved.desktop.displays.find(display => display.id === value.displayId)?.label ?? null } : surface) }; return structuredClone(saved); }),
    retry: fn(async () => structuredClone(saved)), ...overrides
  };
}
const meta = {
  tags: ["mantine-stage6b", "mantine-stage6b-surfaces", "public-output-retirement"], title: "Management/Settings/Overlay surfaces", component: OverlaySurfacesPanel, args: { api: api() }, parameters: { layout: "padded" } } satisfies Meta<typeof OverlaySurfacesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DesktopLayersWithRetiredMetadata: Story = {};
export const DesktopDraft: Story = {
  args: { api: api() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Move Future module up on Desktop overlay" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show Alerts on Desktop overlay" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Desktop overlay" }));
    await expect(canvas.queryByRole("button", { name: "Save Desktop overlay" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Save Unified browser: default" })).toBeNull();
    await expect(canvas.getByRole("checkbox", { name: "Show Alerts on Desktop overlay" })).not.toBeChecked();
  }
};
export const CliUnavailable: Story = { args: { api: api({ ...view(), desktop: { available: false, displays: [], state: "unavailable", message: "Desktop output requires the Windows desktop application. Module browser sources remain available." } }) } };
export const MissingDisplay: Story = { args: { api: api({ ...view(), desktop: { ...view().desktop, displays: [], state: "unavailable", message: "The saved left display is disconnected. Select a connected display and save; output will not fall back automatically." } }) } };
export const AutomaticallyReboundDisplay: Story = { args: { api: api({ ...view(), desktopBindingState: "rebound" }) } };
export const AmbiguousDisplayName: Story = { args: { api: api({ ...view(), desktop: { ...view().desktop, displays: [], state: "unavailable", message: "Choose a display manually." }, desktopBindingState: "ambiguous" }) } };
export const UnusedDesktopUnavailable: Story = { args: { api: api({
  ...view(),
  surfaces: view().surfaces.map((surface) => surface.kind === "desktop" ? { ...surface, enabled: false } : surface),
  desktop: { available: false, displays: [], state: "unavailable", message: "Desktop output is unavailable but is not enabled." }
}) } };
export const Loading: Story = { args: { api: api(view(), { load: async () => new Promise(() => {}) }) } };
export const LoadFailure: Story = { args: { api: api(view(), { load: async () => { throw new Error("The local service is unavailable."); } }) } };
export const SavedButRuntimeFailed: Story = {
  args: { api: api({ ...view(), desktop: { ...view().desktop, state: "failed", message: "Settings were saved, but the desktop renderer failed. Use Retry to restore future alerts." } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Move Future module up on Desktop overlay" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Desktop overlay" }));
    await expect(await canvas.findByText("Desktop settings saved; output needs attention.")).toBeVisible();
  }
};
export const Empty: Story = { args: { api: api({ ...view(), surfaces: [] }) } };

const retiredAttemptsApi = () => ({ ...api(), load: fn(async () => ({ ...view(), retiredOutputAttempts: [
  { kind: "unified" as const, lastSeenAt: "2026-10-11T12:00:00.000Z", count: 4 },
  { kind: "module-test" as const, lastSeenAt: "2026-10-11T11:30:00.000Z", count: 1 }
] })) });
const clearRetiredDismissal = () => { try { window.localStorage.removeItem("stream-jams-retired-output-banner-dismissed"); } catch { /* Story still renders. */ } };

/** The service reports an old public test or unified OBS source still connecting; the operator replaces and dismisses it. */
export const RetiredSourceStillConnecting: Story = {
  tags: ["retired-output-banner"],
  args: { api: retiredAttemptsApi() },
  beforeEach: clearRetiredDismissal,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = await canvas.findByRole("region", { name: "An old test or unified OBS source is still connecting." });
    await expect(banner).toHaveTextContent("Replace it with the new per-module source URL and size shown below.");
    await expect(within(banner).getByRole("link", { name: "Alerts sources" })).toHaveAttribute("href", "/manage/modules/alerts#browser-sources");
    await userEvent.click(within(banner).getByRole("button", { name: "Dismiss" }));
    await expect(canvas.queryByRole("region", { name: "An old test or unified OBS source is still connecting." })).toBeNull();
  }
};

/** Same report before dismissal, for visual and accessibility review. */
export const RetiredSourceBanner: Story = {
  tags: ["retired-output-banner"],
  args: { api: retiredAttemptsApi() },
  beforeEach: clearRetiredDismissal,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("region", { name: "An old test or unified OBS source is still connecting." })).toHaveTextContent("Old test source");
  }
};
