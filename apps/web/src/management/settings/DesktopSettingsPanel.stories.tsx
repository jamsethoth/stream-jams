import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { createStoryAudioApi } from "../../stories/audio-fixtures.js";
import { SettingsPanel } from "./SettingsPanel.js";

const api = createStoryManagementApi();
const meta = {
  title: "Management/Settings/Desktop",
  component: SettingsPanel,
  args: { audioApi: createStoryAudioApi(), managementApi: { ...api, getDesktopConfig: async () => ({ available: true, closeToTray: true }) } }
} satisfies Meta<typeof SettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CloseToTray: Story = {};
export const CloseQuits: Story = { args: { managementApi: { ...api, getDesktopConfig: async () => ({ available: true, closeToTray: false }) } } };
export const RuntimeUnavailable: Story = { args: { managementApi: api } };
export const Loading: Story = { args: { managementApi: { ...api, getDesktopConfig: () => new Promise(() => {}) } } };
export const LoadFailed: Story = { args: { managementApi: { ...api, getDesktopConfig: async () => { throw new Error("The desktop service is unavailable. Retry loading settings."); } } } };
export const Saving: Story = {
  args: { managementApi: { ...meta.args.managementApi, updateDesktopConfig: () => new Promise(() => {}) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "Close window to tray" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save desktop settings" }));
    await expect(canvas.getByRole("checkbox", { name: "Close window to tray" })).toBeDisabled();
  }
};
export const SaveFailed: Story = {
  args: { managementApi: { ...meta.args.managementApi, updateDesktopConfig: async () => { throw new Error("The preference could not be written. Check data-folder permissions and retry."); } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "Close window to tray" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save desktop settings" }));
    await expect(canvas.findByText("The preference could not be written. Check data-folder permissions and retry.")).resolves.toBeVisible();
  }
};
