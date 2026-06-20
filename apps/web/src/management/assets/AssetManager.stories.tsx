import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssetManager } from "./AssetManager.js";
import { createStoryAssetApi } from "../../stories/mock-apis.js";

const meta = {
  title: "Management/AssetManager",
  component: AssetManager
} satisfies Meta<typeof AssetManager>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAssets: Story = {
  args: {
    assetApi: createStoryAssetApi()
  }
};

export const Empty: Story = {
  args: {
    assetApi: createStoryAssetApi({
      listAssets: async () => []
    })
  }
};

export const LoadError: Story = {
  args: {
    assetApi: createStoryAssetApi({
      listAssets: async () => {
        throw new Error("Unable to load assets.");
      }
    })
  }
};
