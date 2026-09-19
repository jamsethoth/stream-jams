import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MusicMetadataProbe } from "./media-metadata-probe.js";

describe("MusicMetadataProbe", () => {
  it("reads a positive duration from MP4 metadata", async () => {
    const filename = "neutral-with-audio.mp4";
    const mimeType = "video/mp4";
    const bytes = await readFile(resolve("tests/fixtures/media", filename));
    const result = await new MusicMetadataProbe().inspect({
      mediaType: "video",
      mimeType,
      sizeBytes: bytes.byteLength,
      bytes
    });

    expect(result.durationMs).toEqual(expect.any(Number));
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("returns null when a valid WebM omits container duration metadata", async () => {
    const bytes = await readFile(resolve("tests/fixtures/media", "neutral-with-audio.webm"));
    await expect(new MusicMetadataProbe().inspect({
      mediaType: "video",
      mimeType: "video/webm",
      sizeBytes: bytes.byteLength,
      bytes
    })).resolves.toEqual({ durationMs: null });
  });
});
