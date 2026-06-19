import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementApp } from "./ManagementApp.js";
import { createStoryAlertApi, createStoryAssetApi, createStoryManagementApi } from "../stories/mock-apis.js";

const meta = {
  title: "Management/ManagementApp",
  component: ManagementApp,
  parameters: {
    docs: {
      description: {
        component: "Full management shell with the real navigation and panel routing."
      }
    }
  }
} satisfies Meta<typeof ManagementApp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullShell: Story = {
  args: {
    alertApi: createStoryAlertApi(),
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  parameters: {
    docs: {
      description: {
        story: "Use this to inspect the default operator shell before drilling into individual panel states."
      }
    }
  }
};
