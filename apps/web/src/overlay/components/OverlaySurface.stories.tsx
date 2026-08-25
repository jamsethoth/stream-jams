import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type OverlayComposition
} from "@stream-jams/core";
import { AudioActivationPrompt, OverlaySurface } from "./OverlaySurface.js";
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
    viewport: {
      options: {
        landscapeCanonical: { name: "Landscape 1920 x 1080", styles: { width: "1920px", height: "1080px" } },
        landscapeNoncanonical: { name: "Landscape in 1200 x 800", styles: { width: "1200px", height: "800px" } },
        verticalCanonical: { name: "Vertical 1080 x 1920", styles: { width: "1080px", height: "1920px" } },
        verticalNoncanonical: { name: "Vertical in 1200 x 800", styles: { width: "1200px", height: "800px" } }
      }
    },
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
    muted: false,
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
    muted: false,
    resolveAssetUrl
  }
};

export const CompatibilityTextStyle: Story = {
  args: {
    composition: styledTextComposition("landscape", compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle),
    muted: false,
    resolveAssetUrl
  }
};

export const CustomSerifTextStyle: Story = {
  args: {
    composition: styledTextComposition(
      "landscape",
      {
        ...compatibilityAlertTextStyle,
        fontPreset: "serif",
        fontSizePx: 64,
        fontWeight: 700,
        lineHeight: 1.3,
        horizontalAlign: "left",
        verticalAlign: "bottom",
        color: "#FFCC00FF",
        shadow: null
      },
      {
        backgroundColor: "#102030BF",
        paddingPx: 24,
        cornerRadiusPx: 18,
        shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
      }
    ),
    muted: false,
    resolveAssetUrl
  }
};

export const RoundedVerticalTextStyle: Story = {
  args: {
    composition: styledTextComposition(
      "vertical",
      {
        ...compatibilityAlertTextStyle,
        fontPreset: "rounded-sans",
        fontSizePx: 72,
        color: "#9FFFEFFF"
      },
      {
        backgroundColor: "#102030CC",
        paddingPx: 32,
        cornerRadiusPx: 32,
        shadow: { offsetX: 0, offsetY: 8, blur: 24, color: "#00000080" }
      }
    ),
    muted: false,
    resolveAssetUrl
  },
  parameters: { viewport: { defaultViewport: "verticalCanonical" } }
};

export const InvalidTextStyleFailClosed: Story = {
  args: {
    composition: styledTextComposition(
      "landscape",
      { ...compatibilityAlertTextStyle, fontPreset: "remote-font" } as never,
      compatibilityAlertTextBoxStyle
    ),
    muted: false,
    resolveAssetUrl
  },
  parameters: {
    docs: {
      description: {
        story: "A forged unsupported preset renders no viewer-visible content and reports through playback diagnostics."
      }
    }
  }
};

export const Media: Story = {
  args: {
    composition: mediaOverlayComposition,
    muted: false,
    resolveAssetUrl
  }
};

export const TestAudioActivation: Story = {
  args: {
    composition: idleOverlayComposition,
    muted: false,
    resolveAssetUrl
  },
  render: () => <AudioActivationPrompt onEnable={() => undefined} />,
  parameters: {
    docs: {
      description: {
        story: "Shown only when a management-triggered test needs one browser interaction before audio can play."
      }
    }
  }
};

export const AnimatedShape: Story = {
  args: {
    composition: {
      overlayId: "overlay-alerts-test",
      purpose: "test",
      scope: "module",
      targetProfileId: "landscape",
      modules: [{
        moduleId: "alerts",
        enabled: true,
        instructions: [{
          id: "instruction-shape",
          overlayId: "overlay-alerts-test",
          moduleId: "alerts",
          purpose: "test",
          scope: "module",
          targetProfileId: "landscape",
          visual: null,
          audio: null,
          text: null,
          shape: { fill: "#45C4AEFF", layout: { x: 660, y: 390, width: 600, height: 300, zIndex: 4 } },
          animation: { mode: "preset", entrance: "scale", exit: "fade", durationMs: 600, delayMs: 250, easing: "ease-out" },
          tts: null,
          durationMs: 4_000
        }]
      }]
    } satisfies OverlayComposition,
    muted: false,
    resolveAssetUrl
  }
};

export const LandscapeCanonical: Story = {
  args: {
    composition: profileComposition("landscape"),
    muted: false,
    resolveAssetUrl
  },
  parameters: { viewport: { defaultViewport: "landscapeCanonical" } }
};

export const LandscapeNoncanonical: Story = {
  args: {
    composition: profileComposition("landscape"),
    muted: false,
    resolveAssetUrl
  },
  parameters: { viewport: { defaultViewport: "landscapeNoncanonical" } }
};

export const VerticalCanonical: Story = {
  args: {
    composition: profileComposition("vertical"),
    muted: false,
    resolveAssetUrl
  },
  parameters: { viewport: { defaultViewport: "verticalCanonical" } }
};

export const VerticalNoncanonical: Story = {
  args: {
    composition: profileComposition("vertical"),
    muted: false,
    resolveAssetUrl
  },
  parameters: { viewport: { defaultViewport: "verticalNoncanonical" } }
};

export const ErrorSafe: Story = {
  args: {
    composition: errorSafeOverlayComposition,
    muted: false,
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

export const MutedMedia: Story = {
  args: {
    composition: mediaOverlayComposition,
    muted: true,
    resolveAssetUrl
  },
  parameters: {
    docs: {
      description: {
        story: "Media remains visible while playback audio and speech are muted."
      }
    }
  }
};

function profileComposition(profileId: "landscape" | "vertical"): OverlayComposition {
  const vertical = profileId === "vertical";
  return {
    overlayId: `overlay-alerts-${profileId}`,
    purpose: "test",
    scope: "module",
    targetProfileId: profileId,
    modules: [{
      moduleId: "alerts",
      enabled: true,
      instructions: [{
        id: `instruction-${profileId}`,
        overlayId: `overlay-alerts-${profileId}`,
        moduleId: "alerts",
        purpose: "test",
        scope: "module",
        targetProfileId: profileId,
        visual: null,
        audio: null,
        text: {
          text: vertical ? "Vertical profile alert" : "Landscape profile alert",
          layout: vertical
            ? { x: 140, y: 820, width: 800, height: 180, zIndex: 10 }
            : { x: 560, y: 450, width: 800, height: 180, zIndex: 10 }
        },
        tts: null,
        durationMs: 60_000
      }]
    }]
  };
}

function styledTextComposition(
  profileId: "landscape" | "vertical",
  textStyle: NonNullable<OverlayComposition["modules"][number]["instructions"][number]["text"]>["textStyle"],
  boxStyle: NonNullable<OverlayComposition["modules"][number]["instructions"][number]["text"]>["boxStyle"]
): OverlayComposition {
  const vertical = profileId === "vertical";
  return {
    overlayId: `overlay-alerts-style-${profileId}`,
    purpose: "test",
    scope: "module",
    targetProfileId: profileId,
    modules: [{
      moduleId: "alerts",
      enabled: true,
      instructions: [{
        id: `instruction-style-${profileId}`,
        overlayId: `overlay-alerts-style-${profileId}`,
        moduleId: "alerts",
        purpose: "test",
        scope: "module",
        targetProfileId: profileId,
        visual: null,
        audio: null,
        text: {
          text: vertical ? "Rounded vertical alert" : "Styled alert preview",
          layout: vertical
            ? { x: 140, y: 820, width: 800, height: 320, zIndex: 10 }
            : { x: 560, y: 390, width: 800, height: 300, zIndex: 10 },
          textStyle,
          boxStyle
        },
        tts: null,
        durationMs: 60_000
      }]
    }]
  };
}
