import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverlayOutputsPanel } from "./OverlayOutputsPanel.js";
import { createStoryManagementApi } from "../../stories/mock-apis.js";

const meta = {
  title: "Management/OverlayOutputsPanel",
  component: OverlayOutputsPanel
} satisfies Meta<typeof OverlayOutputsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: {
    managementApi: createStoryManagementApi()
  }
};

export const Empty: Story = {
  args: {
    managementApi: createStoryManagementApi({
      listOverlayOutputs: async () => [],
      listOverlayClients: async () => []
    })
  }
};

export const LoadError: Story = {
  args: {
    managementApi: createStoryManagementApi({
      listOverlayOutputs: async () => {
        throw new Error("Unable to load overlay outputs.");
      }
    })
  }
};
