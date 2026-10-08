import { describe, expect, it } from "vitest";
import { overlayModulePresentationSchema } from "../overlay-modules/presentation.js";
import {
  validateTwitchClipEmbedUrl,
  validateVideoShoutoutAvatarUrl,
  videoShoutoutProjectionSchema
} from "./contract.js";

const embedUrl = "https://clips.twitch.tv/embed?clip=CleverClipSlug-abc_123&parent=127.0.0.1";

describe("Twitch embed URL allowlist", () => {
  it("accepts clip and player embeds for the expected clip with a parent", () => {
    expect(validateTwitchClipEmbedUrl(embedUrl, "CleverClipSlug-abc_123")).toBe(embedUrl);
    const player = "https://player.twitch.tv/?clip=CleverClipSlug-abc_123&parent=localhost&autoplay=true";
    expect(validateTwitchClipEmbedUrl(player, "CleverClipSlug-abc_123")).toBe(player);
  });

  it.each([
    ["missing parent", "https://clips.twitch.tv/embed?clip=Slug"],
    ["duplicate clip", "https://clips.twitch.tv/embed?clip=Slug&clip=Other&parent=localhost"],
    ["other path", "https://clips.twitch.tv/Slug?clip=Slug&parent=localhost"],
    ["custom port", "https://clips.twitch.tv:8443/embed?clip=Slug&parent=localhost"],
    ["credentials", "https://user@clips.twitch.tv/embed?clip=Slug&parent=localhost"],
    ["fragment", "https://clips.twitch.tv/embed?clip=Slug&parent=localhost#x"],
    ["prototype host", "https://constructor/embed?clip=Slug&parent=localhost"]
  ])("rejects %s", (_label, url) => {
    expect(validateTwitchClipEmbedUrl(url, "Slug")).toBeNull();
  });

  it("validates avatar URLs as credential-free HTTPS", () => {
    expect(validateVideoShoutoutAvatarUrl(" https://cdn.example/a.png ")).toBe("https://cdn.example/a.png");
    expect(validateVideoShoutoutAvatarUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});

describe("video shoutout projection", () => {
  const clip = {
    login: "friendly_streamer",
    displayName: "Friendly Streamer",
    clipId: "CleverClipSlug-abc_123",
    embedUrl,
    title: "The big play",
    durationMs: 27_400,
    avatarUrl: null
  };

  it("accepts each overlay state inside the module presentation contract", () => {
    for (const shoutout of [
      { status: "idle" },
      { status: "loading", activationId: "video-shoutout:a", clip },
      { status: "playing", activationId: "video-shoutout:a", clip, endsAtEpochMs: 1_000 },
      { status: "error", activationId: "video-shoutout:a", reason: "no-clip", displayName: null }
    ]) {
      expect(overlayModulePresentationSchema.safeParse({ kind: "video-shoutout", shoutout }).success).toBe(true);
    }
  });

  it("keeps only a shape guard in the shared presentation union", () => {
    expect(overlayModulePresentationSchema.safeParse({ kind: "video-shoutout", shoutout: "idle" }).success).toBe(false);
    expect(overlayModulePresentationSchema.safeParse({ kind: "video-shoutout", shoutout: null }).success).toBe(false);
  });

  it("re-validates embed and avatar URLs at the overlay boundary", () => {
    expect(videoShoutoutProjectionSchema.safeParse({
      status: "loading", activationId: "a", clip: { ...clip, embedUrl: "https://evil.example/embed?clip=CleverClipSlug-abc_123&parent=x" }
    }).success).toBe(false);
    expect(videoShoutoutProjectionSchema.safeParse({
      status: "loading", activationId: "a", clip: { ...clip, avatarUrl: "http://cdn.example/a.png" }
    }).success).toBe(false);
    expect(videoShoutoutProjectionSchema.safeParse({ status: "error", activationId: "a", reason: "raw", displayName: null }).success).toBe(false);
  });
});
