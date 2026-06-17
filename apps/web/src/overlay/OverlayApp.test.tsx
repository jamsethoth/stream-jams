import type { OverlayComposition, OverlayInstruction } from "@stream-jams/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlaySurface } from "./OverlayApp.js";

describe("OverlaySurface", () => {
  it("renders image, gif, video, text, and audio instruction shapes with overlay layout", () => {
    const onPlaybackEvent = vi.fn();

    render(
      <OverlaySurface
        composition={createComposition([
          createInstruction("image-instruction", {
            visual: {
              assetId: "asset-image",
              mediaType: "image"
            },
            text: "Thanks for following",
            audioAssetId: "asset-audio"
          }),
          createInstruction("gif-instruction", {
            visual: {
              assetId: "asset-gif",
              mediaType: "gif"
            }
          }),
          createInstruction("video-instruction", {
            visual: {
              assetId: "asset-video",
              mediaType: "video"
            }
          })
        ])}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/overlay/modules/alerts/test/ovl_moduleKey/assets/${assetId}`}
      />
    );

    const image = screen.getByTestId("overlay-visual-image-instruction");
    const gif = screen.getByTestId("overlay-visual-gif-instruction");
    const video = screen.getByTestId("overlay-video-video-instruction");
    const text = screen.getByText("Thanks for following");
    const audio = screen.getByTestId("overlay-audio-image-instruction");

    expect(image).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-image");
    expect(gif).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-gif");
    expect(video).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-video");
    expect(audio).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-audio");
    expect(image).toHaveStyle({
      height: "120px",
      left: "10px",
      position: "absolute",
      top: "20px",
      width: "320px",
      zIndex: "5"
    });
    expect(text).toHaveStyle({
      height: "80px",
      left: "10px",
      position: "absolute",
      top: "160px",
      width: "320px",
      zIndex: "6"
    });
    expect(screen.getByTestId("overlay-root")).toHaveStyle({
      background: "transparent",
      minHeight: "100vh",
      width: "100vw"
    });
    expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "image-instruction",
      status: "started"
    });
  });

  it("does not render instructions for disabled module snapshots", () => {
    render(
      <OverlaySurface
        composition={{
          overlayId: "default",
          purpose: "test",
          scope: "module",
          modules: [
            {
              moduleId: "alerts",
              enabled: false,
              instructions: [
                createInstruction("disabled-instruction", {
                  text: "This should not appear"
                })
              ]
            }
          ]
        }}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.queryByText("This should not appear")).not.toBeInTheDocument();
  });

  it("reports missing visual media as playback failure", () => {
    const onPlaybackEvent = vi.fn();
    render(
      <OverlaySurface
        composition={createComposition([
          createInstruction("missing-image", {
            visual: {
              assetId: "missing",
              mediaType: "image"
            }
          })
        ])}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/overlay/modules/alerts/test/ovl_moduleKey/assets/${assetId}`}
      />
    );

    fireEvent.error(screen.getByTestId("overlay-visual-missing-image"));

    expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "missing-image",
      status: "failed",
      message: "Image playback failed"
    });
  });
});

function createComposition(instructions: readonly OverlayInstruction[]): OverlayComposition {
  return {
    overlayId: "default",
    purpose: "test",
    scope: "module",
    modules: [
      {
        moduleId: "alerts",
        enabled: true,
        instructions
      }
    ]
  };
}

function createInstruction(
  id: string,
  options: {
    readonly visual?: {
      readonly assetId: string;
      readonly mediaType: "image" | "gif" | "video";
    };
    readonly text?: string;
    readonly audioAssetId?: string;
  }
): OverlayInstruction {
  return {
    id,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "test",
    scope: "module",
    visual:
      options.visual === undefined
        ? null
        : {
            assetId: options.visual.assetId,
            mediaType: options.visual.mediaType,
            layout: {
              x: 10,
              y: 20,
              width: 320,
              height: 120,
              zIndex: 5
            }
          },
    audio:
      options.audioAssetId === undefined
        ? null
        : {
            assetId: options.audioAssetId,
            volume: 0.75
          },
    text:
      options.text === undefined
        ? null
        : {
            text: options.text,
            layout: {
              x: 10,
              y: 160,
              width: 320,
              height: 80,
              zIndex: 6
            }
          },
    tts: null,
    durationMs: 4000
  };
}
