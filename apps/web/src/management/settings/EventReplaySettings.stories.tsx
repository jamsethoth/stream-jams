import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { EventReplaySettings, type EventReplaySettingsApi } from "./EventReplaySettings.js";

function api(replayAgeSeconds = 120): EventReplaySettingsApi {
  let current = { replayAgeSeconds };
  return {
    getEventBusSettings: fn(async () => current),
    saveEventBusSettings: fn(async (settings) => { current = settings; return current; })
  };
}

const meta = { title: "Management/Settings/Event replay", component: EventReplaySettings, tags: ["central-event-bus"], args: { api: api() }, parameters: { layout: "padded" } } satisfies Meta<typeof EventReplaySettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("combobox", { name: "Replay age" })).toHaveValue("120");
    await expect(canvas.queryByRole("button", { name: "Save replay age" })).not.toBeInTheDocument();
  }
};

export const ChangeAndSave: Story = {
  args: { api: api() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(await canvas.findByRole("combobox", { name: "Replay age" }), "600");
    await userEvent.click(canvas.getByRole("button", { name: "Save replay age" }));
    await expect(args.api.saveEventBusSettings).toHaveBeenCalledWith({ replayAgeSeconds: 600 });
    await expect(await canvas.findByText("Event replay age saved.")).toBeVisible();
  }
};

export const ReplayOff: Story = {
  args: { api: api(0) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("option", { name: "Off: skip missed events", selected: true })).toBeInTheDocument();
  }
};

export const Loading: Story = { args: { api: { ...api(), getEventBusSettings: async () => new Promise(() => {}) } } };

export const ServiceUnavailable: Story = {
  args: { api: { ...api(), getEventBusSettings: async () => { throw new Error("The local service is unavailable."); } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Event replay settings could not be loaded")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible();
  }
};
