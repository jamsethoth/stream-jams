import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsPanel } from "./SettingsPanel.js";
import { createStoryManagementApi } from "../../stories/mock-apis.js";

const meta = {
  title: "Management/SettingsPanel",
  component: SettingsPanel
} satisfies Meta<typeof SettingsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: {
    managementApi: createStoryManagementApi()
  },
  parameters: {
    docs: {
      description: {
        story: "Use this for the local server and moderation form layout."
      }
    }
  }
};

export const LoadError: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getServerConfig: async () => {
        throw new Error("Server settings are unavailable.");
      }
    })
  }
};
