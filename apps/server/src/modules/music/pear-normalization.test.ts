import { describe, expect, it } from "vitest";
import { extractPearArtworkDescriptor, normalizePearObservation } from "./pear-normalization.js";

const context = { providerId: "provider_1", generation: "generation_1", revision: 1, observedAtEpochMs: 1_000 } as const;

describe("normalizePearObservation", () => {
  it("maps flat PLAYER_INFO seconds and preserves the provided artist as one name", () => {
    const snapshot = normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "abc", title: "Title", artist: "Doe, Jane", songDuration: 95 }, isPlaying: true, position: 12 }, null, context);
    expect(snapshot).toMatchObject({ track: { id: "abc", title: "Title", artists: ["Doe, Jane"] }, playbackState: "playing", positionMs: 12_000, durationMs: 95_000 });
  });

  it("clears on an explicit empty song and preserves same-track metadata on partial events", () => {
    const first = normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "abc", title: "Title", artist: "Jane", songDuration: 95 }, isPlaying: true, position: 12 }, null, context);
    const partial = normalizePearObservation({ type: "POSITION_CHANGED", position: 13 }, first, { ...context, revision: 2 });
    expect(partial.track).toEqual(first.track);
    expect(partial.durationMs).toBe(95_000);
    const empty = normalizePearObservation({ type: "PLAYER_INFO", song: null, isPlaying: false }, partial, { ...context, revision: 3 });
    expect(empty.track).toBeNull();
    expect(empty.positionMs).toBeNull();
    expect(empty.durationMs).toBeNull();
  });

  it("rejects malformed values and never fabricates unknown timing", () => {
    expect(() => normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "id", title: "x" }, position: -1 }, null, context)).toThrow();
    const snapshot = normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "id", title: "x", artist: "a" } }, null, context);
    expect(snapshot.positionMs).toBeNull();
    expect(snapshot.durationMs).toBeNull();
  });

  it("distinguishes absent same-track fields from explicit empty fields", () => {
    const first = normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "abc", title: "Old", artist: "Jane", album: "Album" }, isPlaying: true }, null, { ...context, artworkRef: "art_first" });
    const absent = normalizePearObservation({ type: "REST_SONG", song: { videoId: "abc" } }, first, { ...context, revision: 2 });
    expect(absent.track).toMatchObject({ title: "Old", artists: ["Jane"], album: "Album", artworkRef: "art_first" });
    const cleared = normalizePearObservation({ type: "REST_SONG", song: { videoId: "abc", title: "", artist: [], album: null } }, absent, { ...context, revision: 3, artworkRef: null });
    expect(cleared.track).toMatchObject({ title: "", artists: [], album: null, artworkRef: null });
  });

  it("does not copy previous playback or metadata to a new track", () => {
    const first = normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "abc", title: "Old", artist: "Jane" }, isPlaying: true }, null, context);
    const next = normalizePearObservation({ type: "VIDEO_CHANGED", song: { videoId: "def" } }, first, { ...context, revision: 2 });
    expect(next).toMatchObject({ track: { id: "def", title: "", artists: [], album: null }, playbackState: "unknown", positionMs: 0, durationMs: null });
  });

  it("rejects oversized metadata and ignores unrelated events outside normalization", () => {
    expect(() => normalizePearObservation({ type: "PLAYER_INFO", song: { videoId: "id", title: "x".repeat(1025) } }, null, context)).toThrow();
    expect(() => normalizePearObservation({ type: "VOLUME_CHANGED" }, null, context)).toThrow();
  });
});

it("recognizes Pear artwork on the exact yt3 image host", () => {
  expect(extractPearArtworkDescriptor({ imageSrc: "https://yt3.googleusercontent.com/album" })).toEqual({ url: "https://yt3.googleusercontent.com/album" });
  expect(extractPearArtworkDescriptor({ imageSrc: "https://yt3.googleusercontent.com.evil.test/album" })).toBeNull();
});
