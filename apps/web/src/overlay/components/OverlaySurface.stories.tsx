import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverlaySurface } from "./OverlaySurface.js";
import {
  errorSafeOverlayComposition,
  idleOverlayComposition,
  mediaOverlayComposition,
  textOnlyOverlayComposition
} from "../../stories/story-fixtures.js";

const meta: Meta<typeof OverlaySurface> = {
  title: "Overlay/OverlaySurface",
  component: OverlaySurface,
  decorators: [
    (Story) => (
      <div style={{ background: "#20242c", minHeight: "100vh", width: "100vw" }}>
        <Story />
      </div>
    )
  ],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Fullscreen transparent browser-source renderer using normalized overlay instructions."
      }
    }
  }
};

export default meta;

type Story = StoryObj<typeof meta>;

const resolveAssetUrl = (assetId: string) =>
  assetId === "asset-alert-image" ? "/storybook-assets/tiny-alert.svg" : "/storybook-assets/tiny-alert.svg";

export const Idle: Story = {
  args: {
    composition: idleOverlayComposition,
    resolveAssetUrl
  },
  parameters: {
    docs: {
      description: {
        story: "Use this to verify transparent idle output."
      }
    }
  }
};

export const TextOnly: Story = {
  args: {
    composition: textOnlyOverlayComposition,
    resolveAssetUrl
  }
};

export const Media: Story = {
  args: {
    composition: mediaOverlayComposition,
    resolveAssetUrl
  }
};

export const ErrorSafe: Story = {
  args: {
    composition: errorSafeOverlayComposition,
    resolveAssetUrl
  },
  parameters: {
    docs: {
      description: {
        story: "Use this to verify production fail-closed overlay behavior: nothing is rendered on the broadcast surface."
      }
    }
  }
};
