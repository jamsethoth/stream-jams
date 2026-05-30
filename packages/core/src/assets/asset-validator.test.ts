import { describe, expect, it } from "vitest";
import { DefaultAssetValidator, defaultAssetValidationPolicy } from "./asset-validator.js";

describe("DefaultAssetValidator", () => {
  const validator = new DefaultAssetValidator();

  it("accepts common browser-safe media files and normalizes their media type", () => {
    expect(
      validator.validate({
        originalFileName: "Alert.PNG",
        mimeType: "image/png",
        sizeBytes: 1024
      })
    ).toEqual({
      accepted: true,
      reason: null,
      mediaType: "image",
      normalizedExtension: ".png"
    });
    expect(
      validator.validate({
        originalFileName: "celebration.gif",
        mimeType: "image/gif",
        sizeBytes: 2048
      }).mediaType
    ).toBe("gif");
    expect(
      validator.validate({
        originalFileName: "intro.mp4",
        mimeType: "video/mp4",
        sizeBytes: 4096
      }).mediaType
    ).toBe("video");
    expect(
      validator.validate({
        originalFileName: "sound.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 4096
      }).mediaType
    ).toBe("audio");
  });

  it("rejects unsupported MIME types and extensions", () => {
    expect(
      validator.validate({
        originalFileName: "malware.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024
      })
    ).toEqual({
      accepted: false,
      reason: "Unsupported media type",
      mediaType: null,
      normalizedExtension: null
    });
    expect(
      validator.validate({
        originalFileName: "vector.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 1024
      })
    ).toMatchObject({
      accepted: false,
      reason: "Unsupported media type"
    });
  });

  it("rejects mismatched MIME type and file extension pairs", () => {
    expect(
      validator.validate({
        originalFileName: "photo.png",
        mimeType: "image/jpeg",
        sizeBytes: 1024
      })
    ).toEqual({
      accepted: false,
      reason: "File extension does not match media type",
      mediaType: null,
      normalizedExtension: null
    });
  });

  it("rejects empty and oversized files before storage", () => {
    expect(
      validator.validate({
        originalFileName: "empty.png",
        mimeType: "image/png",
        sizeBytes: 0
      })
    ).toMatchObject({
      accepted: false,
      reason: "File is empty"
    });
    expect(
      validator.validate({
        originalFileName: "huge.png",
        mimeType: "image/png",
        sizeBytes: defaultAssetValidationPolicy.image.maxSizeBytes + 1
      })
    ).toMatchObject({
      accepted: false,
      reason: "File exceeds the 10 MiB image limit"
    });
  });
});
