import type { AssetMediaType, AssetValidationResult } from "./types.js";

export interface AssetValidationInput {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface AssetValidationRule {
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly extensions: readonly string[];
  readonly maxSizeBytes: number;
  readonly maxSizeLabel: string;
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
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "image",
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "image",
    mimeType: "image/webp",
    extensions: [".webp"],
    ...defaultAssetValidationPolicy.image
  },
  {
    mediaType: "gif",
    mimeType: "image/gif",
    extensions: [".gif"],
    ...defaultAssetValidationPolicy.gif
  },
  {
    mediaType: "video",
    mimeType: "video/mp4",
    extensions: [".mp4"],
    ...defaultAssetValidationPolicy.video
  },
  {
    mediaType: "video",
    mimeType: "video/webm",
    extensions: [".webm"],
    ...defaultAssetValidationPolicy.video
  },
  {
    mediaType: "audio",
    mimeType: "audio/mpeg",
    extensions: [".mp3"],
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/wav",
    extensions: [".wav"],
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/ogg",
    extensions: [".ogg", ".oga"],
    ...defaultAssetValidationPolicy.audio
  },
  {
    mediaType: "audio",
    mimeType: "audio/webm",
    extensions: [".webm"],
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
