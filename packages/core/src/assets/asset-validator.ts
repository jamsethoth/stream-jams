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
    const normalizedMimeType = input.mimeType.trim().toLowerCase();
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
