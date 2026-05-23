import type { Redactor } from "@stream-jams/core";

const defaultReplacement = "[REDACTED]";
const overlayKeyPattern = /ovl_[A-Za-z0-9_-]+/g;
const authorizationValuePattern = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const standaloneApiKeyPattern = /\bsk-[A-Za-z0-9_-]+\b/g;
const sensitiveNamePatterns = [
  /authorization/i,
  /proxy[-_]?authorization/i,
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /oauth/i,
  /secret/i,
  /password/i,
  /overlay[-_]?key/i,
  /token/i,
  /client[-_]?secret/i
];
const sensitiveUrlParamNames = new Set(
  [
  "access_token",
  "refresh_token",
  "token",
  "api_key",
  "apikey",
  "key",
  "signature",
  "sig",
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-security-token",
  "key-pair-id"
  ].map(normalizeName)
);

export interface RedactorOptions {
  readonly replacement?: string;
  readonly secretNames?: readonly string[];
}

export function createRedactor(options: RedactorOptions = {}): Redactor {
  const replacement = options.replacement ?? defaultReplacement;
  const configuredSecretNames = new Set((options.secretNames ?? []).map(normalizeName));

  function redact<T>(value: T): T {
    return redactValue(value) as T;
  }

  function redactValue(value: unknown): unknown {
    if (typeof value === "string") {
      return redactText(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item));
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, childValue]) => [
          key,
          isSensitiveName(key, configuredSecretNames) ? replacement : redactValue(childValue)
        ])
      );
    }

    return value;
  }

  function redactText(value: string): string {
    return redactOverlayKeys(
      redactUrls(value.replace(authorizationValuePattern, (_match, scheme: string) => `${scheme} ${replacement}`).replace(
        standaloneApiKeyPattern,
        replacement
      ))
    );
  }

  return {
    redact,
    redactText
  };

  function redactUrls(value: string): string {
    return value.replace(/https?:\/\/[^\s"'<>]+/g, (candidate) => redactUrl(candidate));
  }

  function redactUrl(value: string): string {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      return value;
    }

    let changed = false;
    for (const name of Array.from(url.searchParams.keys())) {
      if (sensitiveUrlParamNames.has(normalizeName(name))) {
        url.searchParams.set(name, replacement);
        changed = true;
      }
    }

    return changed ? url.toString() : value;
  }

  function redactOverlayKeys(value: string): string {
    return value.replace(overlayKeyPattern, replacement);
  }
}

function isSensitiveName(name: string, configuredSecretNames: ReadonlySet<string>): boolean {
  const normalizedName = normalizeName(name);
  return configuredSecretNames.has(normalizedName) || sensitiveNamePatterns.some((pattern) => pattern.test(name));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
