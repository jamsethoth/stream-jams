import { createTwitchDataFixture } from "./twitch-data-source-fixtures.js";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DataPage } from "./DataPage.js";
import { DataCanvasEditor } from "./DataCanvasEditor.js";
import { DataOverlaysPage } from "./DataOverlaysPage.js";
import { createDataManagementFixture } from "./data-management-fixtures.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";

const meta = { title: "Management/Data Overlays", tags: ["data-management"], component: DataPage } satisfies Meta<typeof DataPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Definitions: Story = { render: () => <DataPage twitchSourcesApi={createTwitchDataFixture()} api={createDataManagementFixture()} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Add value" })); await userEvent.type(canvas.getByLabelText(/Name/u), "Deaths"); await userEvent.click(canvas.getByRole("button", { name: "Save definition" })); await expect(canvas.findByRole("button", { name: "Edit Deaths" })).resolves.toBeVisible(); } };
export const Empty: Story = { render: () => <DataPage twitchSourcesApi={createTwitchDataFixture()} api={createDataManagementFixture({ revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] })} /> };
export const Loading: Story = { render: () => <DataPage twitchSourcesApi={createTwitchDataFixture()} api={{ ...createDataManagementFixture(), getState: () => new Promise(() => undefined) }} /> };
export const LoadFailure: Story = { render: () => <DataPage twitchSourcesApi={createTwitchDataFixture()} api={{ ...createDataManagementFixture(), getState: async () => { throw new Error("Local service unavailable. Check the service and reload Data."); } }} /> };
export const SavedCanvases: Story = { render: () => <DataOverlaysPage api={createDataManagementFixture()} assetApi={createStoryAssetApi()} managementApi={createStoryManagementApi()} /> };
export const CanvasEditor: Story = { render: () => { const state = dataPreviewFixture(); const assetApi = createStoryAssetApi(); assetApi.listAssets = async () => []; return <DataCanvasEditor state={state} canvas={state.canvases[0]!} api={createDataManagementFixture(state)} assetApi={assetApi} managementApi={createStoryManagementApi()} onSaved={() => undefined} onBack={() => undefined} />; }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Add rectangle" })); await expect(canvas.getByLabelText("Shape RGBA color")).toBeVisible(); await userEvent.click(canvas.getByRole("button", { name: "Duplicate element" })); await expect(canvas.getByText("6 / 100 elements")).toBeVisible(); } };
