import { describe, expect, it } from "vitest";
import { DefaultAssetValidator, defaultAssetValidationPolicy } from "./asset-validator.js";

describe("DefaultAssetValidator", () => {
  const validator = new DefaultAssetValidator();

  it("accepts common browser-safe media files and normalizes their media type", () => {
    expect(
      validator.validate({
        originalFileName: "Alert.PNG",
        mimeType: "image/png",
        sizeBytes: pngBytes.byteLength,
        bytes: pngBytes
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
        sizeBytes: gifBytes.byteLength,
        bytes: gifBytes
      }).mediaType
    ).toBe("gif");
    expect(
      validator.validate({
        originalFileName: "intro.mp4",
        mimeType: "video/mp4",
        sizeBytes: mp4Bytes.byteLength,
        bytes: mp4Bytes
      }).mediaType
    ).toBe("video");
    expect(
      validator.validate({
        originalFileName: "sound.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: mp3Bytes.byteLength,
        bytes: mp3Bytes
      }).mediaType
    ).toBe("audio");
  });

  it("rejects unsupported MIME types and extensions", () => {
    expect(
      validator.validate({
        originalFileName: "malware.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: pngBytes.byteLength,
        bytes: pngBytes
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
        sizeBytes: pngBytes.byteLength,
        bytes: pngBytes
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
        sizeBytes: jpegBytes.byteLength,
        bytes: jpegBytes
      })
    ).toEqual({
      accepted: false,
      reason: "File extension does not match media type",
      mediaType: null,
      normalizedExtension: null
    });
  });

  it("rejects bytes whose signature does not match the declared media type", () => {
    expect(
      validator.validate({
        originalFileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: invalidBytes.byteLength,
        bytes: invalidBytes
      })
    ).toEqual({
      accepted: false,
      reason: "File signature does not match media type",
      mediaType: null,
      normalizedExtension: null
    });
  });

  it("rejects empty and oversized files before storage", () => {
    expect(
      validator.validate({
        originalFileName: "empty.png",
        mimeType: "image/png",
        sizeBytes: 0,
        bytes: new Uint8Array()
      })
    ).toMatchObject({
      accepted: false,
      reason: "File is empty"
    });
    expect(
      validator.validate({
        originalFileName: "huge.png",
        mimeType: "image/png",
        sizeBytes: defaultAssetValidationPolicy.image.maxSizeBytes + 1,
        bytes: pngBytes
      })
    ).toMatchObject({
      accepted: false,
      reason: "File exceeds the 10 MiB image limit"
    });
  });
});

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]);
const gifBytes = asciiBytes("GIF89a");
const mp4Bytes = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 0x04]);
const invalidBytes = asciiBytes("not a png");

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}
