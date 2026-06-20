import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DashboardSummary } from "../management-api.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { createStoryManagementApi } from "../../stories/mock-apis.js";

const meta = {
  title: "Management/DashboardPanel",
  component: DashboardPanel
} satisfies Meta<typeof DashboardPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    managementApi: createStoryManagementApi()
  }
};

export const Loading: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getDashboard: async () => new Promise<DashboardSummary>(() => {})
    })
  }
};

export const LoadError: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getDashboard: async () => {
        throw new Error("Unable to load dashboard.");
      }
    })
  }
};
