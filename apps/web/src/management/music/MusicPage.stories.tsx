import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { MusicPage } from "./MusicPage.js";

const baseApi = () => createStoryManagementApi({ listMusicOutputs: async () => [] });
const meta = {
  title: "Management/Music Appearance", component: MusicPage, tags: ["music-task-13"],
  args: { api: baseApi(), assetApi: createStoryAssetApi() },
  decorators: [(Story) => <DirtyNavigationProvider><div className="management-main"><Story /></div></DirtyNavigationProvider>]
} satisfies Meta<typeof MusicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saved: Story = {
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("All changes saved")).toBeVisible(); }
};
export const EmptyAssets: Story = {
  args: { api: createStoryManagementApi({ listAssetLibraryItems: async () => [], listMusicOutputs: async () => [] }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("No image")).toBeVisible(); }
};
export const Loading: Story = { args: { api: createStoryManagementApi({ getMusicConfig: () => new Promise(() => undefined) }) } };
export const LoadError: Story = {
  args: { api: createStoryManagementApi({ getMusicConfig: async () => { throw new Error("Local service unavailable"); } }) },
  beforeEach: () => { const reportError = console.error; console.error = (...args: unknown[]) => { if (!String(args[0]).includes("Unable to load Music appearance")) reportError(...args); }; return () => { console.error = reportError; }; },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Unable to load Music appearance")).toBeVisible(); }
};
export const DirtyDraft: Story = {
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByLabelText("Enable Music module after saving")); await expect(canvas.getByText("Unsaved changes")).toBeVisible(); }
};
export const BrandedAndStyled: Story = {
  args: { api: createStoryManagementApi({ getMusicConfig: async () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.views.full.branding.assetId = storyAssetLibraryItems[0]!.id;
    config.css = { ...config.css, enabled: true, source: ".sj-title { color: #F4D080; }" };
    return { enabled: true, config };
  }, listMusicOutputs: async () => [] }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Follower burst")).toBeVisible(); }
};
