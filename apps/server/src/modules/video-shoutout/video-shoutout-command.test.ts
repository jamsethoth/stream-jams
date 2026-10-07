import { describe, expect, it } from "vitest";
import { isVideoShoutoutPayload, parseVideoShoutoutCommand } from "./video-shoutout-command.js";

const embedUrl = "https://clips.twitch.tv/embed?clip=CleverClipSlug-abc_123&parent=127.0.0.1";
const payload = {
  source: "StreamJams",
  type: "VideoShoutout",
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "CleverClipSlug-abc_123",
  embedUrl,
  title: "The big play",
  duration: 27.4,
  avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/friendly.png"
};

describe("video shoutout payload parsing", () => {
  it("accepts a complete manual clip payload and normalizes seconds to milliseconds", () => {
    expect(parseVideoShoutoutCommand(payload)).toEqual({
      status: "accepted",
      command: {
        kind: "play",
        purpose: "live",
        avatarOmitted: false,
        clip: {
          login: "friendly_streamer",
          displayName: "Friendly Streamer",
          clipId: "CleverClipSlug-abc_123",
          embedUrl,
          title: "The big play",
          durationMs: 27_400,
          avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/friendly.png"
        }
      }
    });
  });

  it("accepts numeric string durations, a test purpose, and rounds partial milliseconds up", () => {
    const result = parseVideoShoutoutCommand({ ...payload, duration: "30.0005", purpose: "test" });
    expect(result).toMatchObject({ status: "accepted", command: { kind: "play", purpose: "test", clip: { durationMs: 30_001 } } });
  });

  it("accepts durations up to the overlay playback safety limit", () => {
    expect(parseVideoShoutoutCommand({ ...payload, duration: 120 })).toMatchObject({ command: { clip: { durationMs: 120_000 } } });
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -5],
    ["excessive", 120.5],
    ["non-numeric", "thirty"],
    ["infinite", Number.POSITIVE_INFINITY]
  ])("rejects a %s duration", (_label, duration) => {
    expect(parseVideoShoutoutCommand({ ...payload, duration })).toEqual({
      status: "rejected",
      reason: "invalid-duration",
      fields: ["duration"]
    });
  });

  it("rejects missing required fields and wrong types without echoing values", () => {
    const result = parseVideoShoutoutCommand({ ...payload, login: undefined, title: 42 });
    expect(result).toEqual({ status: "rejected", reason: "invalid-payload", fields: ["login", "title"] });
    expect(JSON.stringify(result)).not.toContain("Friendly");
  });

  it("rejects malformed Twitch logins and clip ids", () => {
    expect(parseVideoShoutoutCommand({ ...payload, login: "not a login" })).toMatchObject({ status: "rejected", fields: ["login"] });
    expect(parseVideoShoutoutCommand({ ...payload, clipId: "<script>" })).toMatchObject({ status: "rejected", fields: ["clipId"] });
  });

  it("rejects unsafe or mismatched embed URLs", () => {
    for (const unsafe of [
      "http://clips.twitch.tv/embed?clip=CleverClipSlug-abc_123&parent=127.0.0.1",
      "https://evil.example/embed?clip=CleverClipSlug-abc_123&parent=127.0.0.1",
      "https://clips.twitch.tv.evil.example/embed?clip=CleverClipSlug-abc_123&parent=127.0.0.1",
      "javascript:alert(1)",
      "https://clips.twitch.tv/embed?clip=SomeOtherClip&parent=127.0.0.1"
    ]) {
      expect(parseVideoShoutoutCommand({ ...payload, embedUrl: unsafe })).toEqual({
        status: "rejected",
        reason: "unsafe-embed-url",
        fields: ["embedUrl"]
      });
    }
  });

  it("omits an unsafe optional avatar while the clip still plays", () => {
    for (const avatarUrl of ["", "http://static-cdn.jtvnw.net/a.png", "not a url", 7, "https://user:secret@cdn.example/a.png"]) {
      const result = parseVideoShoutoutCommand({ ...payload, avatarUrl });
      expect(result).toMatchObject({ status: "accepted", command: { kind: "play", clip: { avatarUrl: null } } });
      expect(result.status === "accepted" && result.command.kind === "play" && result.command.avatarOmitted).toBe(avatarUrl !== "");
    }
    expect(parseVideoShoutoutCommand({ ...payload, avatarUrl: undefined })).toMatchObject({
      command: { avatarOmitted: false, clip: { avatarUrl: null } }
    });
  });

  it("parses explicit clear and no-clip triggers", () => {
    expect(parseVideoShoutoutCommand({ source: "StreamJams", type: "VideoShoutout", action: "clear" })).toEqual({
      status: "accepted",
      command: { kind: "clear", purpose: "live" }
    });
    expect(parseVideoShoutoutCommand({ action: "no-clip", displayName: "Quiet Friend", purpose: "test" })).toEqual({
      status: "accepted",
      command: { kind: "no-clip", purpose: "test", displayName: "Quiet Friend" }
    });
    expect(parseVideoShoutoutCommand({ action: "no-clip", displayName: { nested: true } })).toMatchObject({
      command: { kind: "no-clip", displayName: null }
    });
  });

  it("rejects unknown actions and purposes", () => {
    expect(parseVideoShoutoutCommand({ ...payload, action: "queue" })).toMatchObject({ status: "rejected", fields: ["action"] });
    expect(parseVideoShoutoutCommand({ ...payload, purpose: "lan" })).toMatchObject({ status: "rejected", fields: ["purpose"] });
    expect(parseVideoShoutoutCommand(null)).toMatchObject({ status: "rejected", reason: "invalid-payload" });
  });

  it("recognizes only the Stream Jams video shoutout marker", () => {
    expect(isVideoShoutoutPayload(payload)).toBe(true);
    expect(isVideoShoutoutPayload({ source: "StreamJams", type: "Other" })).toBe(false);
    expect(isVideoShoutoutPayload("StreamJams")).toBe(false);
    expect(isVideoShoutoutPayload(null)).toBe(false);
  });
});
