import type { AssetMediaType, AssetValidationResult } from "./types.js";

export interface AssetValidationInput {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
}

export interface AssetValidationRule {
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly extensions: readonly string[];
  readonly maxSizeBytes: number;
  readonly maxSizeLabel: string;
  readonly matchesSignature: (bytes: Uint8Array) => boolean;
}

export interface AssetValidationPolicy {
  readonly font: { readonly maxSizeBytes: number; readonly maxSizeLabel: string };
  readonly image: {
    readonly maxSizeBytes: number;
    readonly maxSizeLabel: string;
  };
  readonly gif: {
    readonly maxSizeBytes: number;
    readonly maxSizeLabel: string;
  };
  readonly video: {
    readonly maxSizeBytes: number;
    readonly maxSizeLabel: string;
  };
  readonly audio: {
    readonly maxSizeBytes: number;
    readonly maxSizeLabel: string;
  };
}

export interface AssetValidator {
  validate(input: AssetValidationInput): AssetValidationResult;
}

export const defaultAssetValidationPolicy: AssetValidationPolicy = {
  font: { maxSizeBytes: 10 * 1024 * 1024, maxSizeLabel: "10 MiB" },
  image: {
    maxSizeBytes: 10 * 1024 * 1024,
    maxSizeLabel: "10 MiB"
  },
  gif: {
    maxSizeBytes: 25 * 1024 * 1024,
    maxSizeLabel: "25 MiB"
  },
  video: {
    maxSizeBytes: 100 * 1024 * 1024,
    maxSizeLabel: "100 MiB"
  },
  audio: {
    maxSizeBytes: 25 * 1024 * 1024,
    maxSizeLabel: "25 MiB"
  }
} as const;

const defaultRules: readonly AssetValidationRule[] = [
  ...(["ttf", "otf", "woff", "woff2"] as const).map(format => ({
    mediaType: "font" as const, mimeType: `font/${format}`, extensions: [`.${format}`],
    matchesSignature: (bytes: Uint8Array) => matchesFontContainer(bytes, format),
    ...defaultAssetValidationPolicy.font
  })),
  {
    mediaType: "image",
    mimeType: "image/png",
    extensions: [".png"],
    matchesSignature: matchesPngSignature,
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "image",
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    matchesSignature: matchesJpegSignature,
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "image",
    mimeType: "image/webp",
    extensions: [".webp"],
    matchesSignature: matchesWebpSignature,
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "gif",
    mimeType: "image/gif",
    extensions: [".gif"],
    matchesSignature: matchesGifSignature,
    ...defaultAssetValidationPolicy.gif
  },
  {
    mediaType: "video",
    mimeType: "video/mp4",
    extensions: [".mp4"],
    matchesSignature: matchesMp4Signature,
    ...defaultAssetValidationPolicy.video
  },
  {
    mediaType: "video",
    mimeType: "video/webm",
    extensions: [".webm"],
    matchesSignature: matchesWebmSignature,
    ...defaultAssetValidationPolicy.video
  },
  {
    mediaType: "audio",
    mimeType: "audio/mpeg",
    extensions: [".mp3"],
    matchesSignature: matchesMp3Signature,
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/wav",
    extensions: [".wav"],
    matchesSignature: matchesWavSignature,
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/ogg",
    extensions: [".ogg", ".oga"],
    matchesSignature: matchesOggSignature,
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/webm",
    extensions: [".webm"],
    matchesSignature: matchesWebmSignature,
    ...defaultAssetValidationPolicy.audio
  }
] as const;

export class DefaultAssetValidator implements AssetValidator {
  readonly #rulesByMimeType: ReadonlyMap<string, AssetValidationRule>;

  constructor(rules: readonly AssetValidationRule[] = defaultRules) {
    this.#rulesByMimeType = new Map(rules.map((rule) => [rule.mimeType, rule]));
  }

  validate(input: AssetValidationInput): AssetValidationResult {
    const normalizedMimeType = normalizeAssetMimeType(input.mimeType, input.originalFileName);
    const rule = this.#rulesByMimeType.get(normalizedMimeType);
    if (rule === undefined) {
      return rejected("Unsupported media type");
    }

    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      return rejected("File is empty");
    }

    if (input.sizeBytes > rule.maxSizeBytes) {
      return rejected(`File exceeds the ${rule.maxSizeLabel} ${rule.mediaType} limit`);
    }

    const extension = readLowercaseExtension(input.originalFileName);
    if (!rule.extensions.includes(extension)) {
      return rejected("File extension does not match media type");
    }

    if (!rule.matchesSignature(input.bytes)) {
      return rejected("File signature does not match media type");
    }

    return {
      accepted: true,
      reason: null,
      mediaType: rule.mediaType,
      normalizedExtension: extension
    };
  }
}

/** Browsers and OS file pickers report several MIME aliases for the same font container. */
export function normalizeAssetMimeType(mimeType: string, fileName: string): string {
  const mime = mimeType.trim().toLowerCase();
  const extension = readLowercaseExtension(fileName);
  const format = extension.slice(1);
  const aliases: Readonly<Record<string, readonly string[]>> = {
    ttf: ["font/ttf", "application/x-font-ttf", "application/x-font-truetype", "application/font-sfnt", "font/sfnt"],
    otf: ["font/otf", "application/x-font-opentype", "application/x-font-otf", "application/vnd.ms-opentype", "application/font-sfnt", "font/sfnt"],
    woff: ["font/woff", "application/font-woff", "application/x-font-woff"],
    woff2: ["font/woff2", "application/font-woff2", "application/x-font-woff2"]
  };
  return aliases[format]?.includes(mime) || (aliases[format] !== undefined && (mime === "" || mime === "application/octet-stream")) ? `font/${format}` : mime;
}

function matchesFontContainer(bytes: Uint8Array, format: "ttf" | "otf" | "woff" | "woff2"): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "ttf" || format === "otf") {
    if (bytes.length < 12 || !(format === "ttf" ? startsWithBytes(bytes, [0, 1, 0, 0]) : asciiAt(bytes, 0, "OTTO"))) return false;
    const count = view.getUint16(4);
    if (count === 0 || count > 256 || 12 + count * 16 > bytes.length) return false;
    for (let index = 0; index < count; index++) {
      const offset = view.getUint32(12 + index * 16 + 8);
      const length = view.getUint32(12 + index * 16 + 12);
      if (offset < 12 + count * 16 || length === 0 || offset + length > bytes.length) return false;
    }
    return true;
  }
  const header = format === "woff" ? 44 : 48;
  if (bytes.length < header || !asciiAt(bytes, 0, format === "woff" ? "wOFF" : "wOF2")) return false;
  const count = view.getUint16(12);
  if (view.getUint32(8) !== bytes.length || count === 0 || count > 256 || view.getUint16(14) !== 0 || view.getUint32(16) < 12 + count * 16) return false;
  if (!(startsWithBytes(bytes.subarray(4), [0, 1, 0, 0]) || asciiAt(bytes, 4, "OTTO"))) return false;
  if (format === "woff2") return view.getUint32(20) > 0 && header + count * 2 + view.getUint32(20) <= bytes.length;
  if (header + count * 20 > bytes.length) return false;
  for (let index = 0; index < count; index++) {
    const base = header + index * 20;
    const offset = view.getUint32(base + 4), compressed = view.getUint32(base + 8), original = view.getUint32(base + 12);
    if (offset < header + count * 20 || compressed === 0 || compressed > original || offset + compressed > bytes.length) return false;
  }
  return true;
}

function rejected(reason: string): AssetValidationResult {
  return {
    accepted: false,
    reason,
    mediaType: null,
    normalizedExtension: null
  };
}

function readLowercaseExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex >= 0 ? trimmed.slice(dotIndex).toLowerCase() : "";
}

function matchesPngSignature(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function matchesJpegSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function matchesWebpSignature(bytes: Uint8Array): boolean {
  return matchesRiffContainer(bytes, "WEBP");
}

function matchesGifSignature(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a");
}

function matchesMp4Signature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && asciiAt(bytes, 4, "ftyp");
}

function matchesWebmSignature(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}

function matchesMp3Signature(bytes: Uint8Array): boolean {
  const secondByte = bytes[1];
  return asciiAt(bytes, 0, "ID3") || (bytes.byteLength >= 2 && bytes[0] === 0xff && secondByte !== undefined && (secondByte & 0xe0) === 0xe0);
}

function matchesWavSignature(bytes: Uint8Array): boolean {
  return matchesRiffContainer(bytes, "WAVE");
}

function matchesOggSignature(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "OggS");
}

function matchesRiffContainer(bytes: Uint8Array, format: string): boolean {
  return asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, format);
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }

  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.byteLength < offset + value.length) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}
