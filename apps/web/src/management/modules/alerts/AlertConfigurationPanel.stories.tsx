import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertConfigurationPanel } from "./AlertConfigurationPanel.js";
import { createStoryAlertApi, createStoryAssetApi } from "../../../stories/mock-apis.js";

const meta = {
  title: "Management/AlertConfigurationPanel",
  component: AlertConfigurationPanel
} satisfies Meta<typeof AlertConfigurationPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ConfiguredRules: Story = {
  args: {
    alertApi: createStoryAlertApi(),
    assetApi: createStoryAssetApi()
  },
  parameters: {
    docs: {
      description: {
        story: "Use this for the rule and variant configuration layout with fixed local assets."
      }
    }
  }
};

export const Empty: Story = {
  args: {
    alertApi: createStoryAlertApi({
      listCollections: async () => [],
      listRules: async () => []
    }),
    assetApi: createStoryAssetApi({
      listAssets: async () => []
    })
  }
};
