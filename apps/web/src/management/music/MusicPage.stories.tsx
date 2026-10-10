import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { MusicPage } from "./MusicPage.js";

const baseApi = () => createStoryManagementApi({ listMusicOutputs: async () => [] });
const meta = {
  title: "Management/Music Appearance", component: MusicPage, tags: ["mantine-stage6d", "mantine-module-proof", "music-task-13", "music-editor-refinement"],
  args: { api: baseApi(), assetApi: createStoryAssetApi() },
  decorators: [(Story) => <DirtyNavigationProvider><div className="management-main"><Story /></div></DirtyNavigationProvider>]
} satisfies Meta<typeof MusicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BrowserSources: Story = {
  args: { api: createStoryManagementApi({ listMusicOutputs: async () => (["landscape", "vertical"] as const).map(targetProfileId => ({ id: targetProfileId, overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId, label: targetProfileId, enabled: true, keyId: null, url: null, copyableUrlStatus: "create-required" })) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
    await expect(canvas.getByRole("article", { name: "Landscape browser source" })).toHaveTextContent("1920 x 1080");
    await expect(canvas.getByRole("article", { name: "Vertical browser source" })).toHaveTextContent("1080 x 1920");
    await expect(canvas.getByRole("button", { name: "Create Landscape URL" })).toBeVisible();
  }
};

export const Saved: Story = {
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("All changes saved")).toBeVisible(); }
};

export const InvalidAppearanceDraft: Story = {
  tags: ["mantine-stage6d-fields", "mantine-stage6d-page-closure"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Expand appearance" }));
    const width = await canvas.findByRole("spinbutton", { name: "Widget width (px)" });
    fireEvent.change(width, { target: { value: "" } });
    await userEvent.click(width);
    await userEvent.tab();
    const correction = canvas.getByRole("alert");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveAttribute("aria-describedby", correction.id);
    await waitFor(() => expect(getComputedStyle(width).borderColor).toBe(getComputedStyle(correction).color));
  }
};
export const EmptyAssets: Story = {
  args: { api: createStoryManagementApi({ listAssetLibraryItems: async () => [], listMusicOutputs: async () => [] }) },
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Expand appearance" })); await expect(await canvas.findByText("No image")).toBeVisible(); }
};
export const Loading: Story = { args: { api: createStoryManagementApi({ getMusicConfig: () => new Promise(() => undefined) }) } };
export const LoadError: Story = {
  args: { api: createStoryManagementApi({ getMusicConfig: async () => { throw new Error("Local service unavailable"); } }) },
  beforeEach: () => { const reportError = console.error; console.error = (...args: unknown[]) => { if (!String(args[0]).includes("Unable to load Music appearance")) reportError(...args); }; return () => { console.error = reportError; }; },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Unable to load Music appearance")).toBeVisible(); }
};
export const DirtyDraft: Story = {
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Expand appearance" })); await userEvent.selectOptions(await canvas.findByLabelText("Theme"), "light"); await expect(canvas.getByText("Unsaved changes")).toBeVisible(); }
};
export const BrandedAndStyled: Story = {
  args: { api: createStoryManagementApi({ getMusicConfig: async () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.views.full.branding.assetId = storyAssetLibraryItems[0]!.id;
    config.css = { ...config.css, enabled: true, source: ".sj-title { color: #F4D080; }" };
    return { enabled: true, config };
  }, listMusicOutputs: async () => [] }) },
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Expand appearance" })); await expect(await canvas.findByText("Follower burst")).toBeVisible(); }
};

export const DisclosuresAndColourSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const settings = await canvas.findByRole("button", { name: "Expand appearance" });
    await expect(settings).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(settings);
    await userEvent.selectOptions(await canvas.findByLabelText("Appearance component"), "title");
    const color = await canvas.findByLabelText("Title color");
    fireEvent.change(color, { target: { value: "#123456" } });
    await waitFor(() => expect(canvas.getByLabelText("Title RGBA")).toHaveValue("#123456FF"));
    fireEvent.change(canvas.getByLabelText("Title opacity"), { target: { value: "50" } });
    await waitFor(() => expect(canvas.getByLabelText("Title RGBA")).toHaveValue("#12345680"));
    await userEvent.click(canvas.getByRole("button", { name: "Collapse appearance" }));
    await userEvent.click(canvas.getByRole("button", { name: "Expand custom css" }));
    await expect(await canvas.findByLabelText("Custom CSS")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Expand appearance" })).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.getByRole("button", { name: "Disable custom CSS" })).toBeVisible();
  }
};

export const LiveTrack: Story = {
  args: { api: createStoryManagementApi({
    listMusicOutputs: async () => [],
    getMusicNowPlaying: async () => ({
      status: { state: "connected", stale: false, diagnosticReference: null },
      snapshot: { providerId: "pear-story", generation: "music_story", revision: 1, track: { id: "story-live", title: "Live from Pear", artists: ["Story Artist"], album: "Preview Sessions", artworkRef: "art_story" }, playbackState: "playing", positionMs: 42_000, durationMs: 180_000, observedAtEpochMs: Date.parse("2026-07-15T05:00:00.000Z"), session: null }
    }),
    getMusicArtwork: async () => (await fetch("/storybook-assets/tiny-image.png")).blob()
  }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Showing the track playing in the selected Music source.")).toBeVisible();
    await expect(canvas.getAllByText("Live from Pear").length).toBeGreaterThan(0);
  }
};
