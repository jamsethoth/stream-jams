import type { Redactor } from "@stream-jams/core";

const defaultReplacement = "[REDACTED]";
const overlayKeyPattern = /ovl_[A-Za-z0-9_-]+/g;
const timerAutomationTokenPattern = /tmr_[A-Za-z0-9_-]+/g;
const mediaGrantPattern = /med_[A-Za-z0-9_-]+/g;
const authorizationValuePattern = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const oauthAuthorizationValuePattern = /\bOAuth\s+(?:[A-Za-z][\w-]*\s*=\s*(?:"(?:\\.|[^"\\])*"|[^,;\s]+)(?:\s*,\s*)?)+/gi;
const standaloneApiKeyPattern = /\bsk-[A-Za-z0-9_-]+\b/g;
const authorizationAssignmentPattern = /\b(authorization)\s*([:=])\s*(?!(?:Bearer|Basic|OAuth)\b)[^\s,;&]+/gi;
const credentialAssignmentPattern = /\b(authentication|credentials?|password|passwd|token|access[-_ ]?token|refresh[-_ ]?token|secret|client[-_ ]?secret|api[-_ ]?key)\s*[:=]\s*(?:bearer\s+)?(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s,;&]+)/gi;
const jsonStringPropertyPattern = /("(?:\\.|[^"\\])*")\s*:\s*"(?:\\.|[^"\\])*"/g;
const sensitiveNamePatterns = [
  /authorization/i,
  /authentication/i,
  /credential/i,
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
    // Exception text can contain a serialized provider frame rather than an object.
    if (/^\s*[[{]/.test(value)) {
      try {
        return JSON.stringify(redactValue(JSON.parse(value) as unknown));
      }
      // error-provenance: allow expected -- non-JSON text still passes through textual redaction
      catch { /* Redact incomplete frames and ordinary text below. */ }
    }

    const normalized = stripUrlUserInformation(normalizeControlCharacters(value)).replace(jsonStringPropertyPattern, (match, quotedName: string) => {
      let name: string;
      try { name = JSON.parse(quotedName) as string; }
      // error-provenance: allow expected -- malformed quoted names still receive textual redaction
      catch { return match; }
      return isSensitiveName(name, configuredSecretNames) ? `${quotedName}:${JSON.stringify(replacement)}` : match;
    });
    return redactUrls(normalized
      .replace(oauthAuthorizationValuePattern, `OAuth ${replacement}`)
      .replace(authorizationValuePattern, (_match, scheme: string) => `${scheme} ${replacement}`)
      .replace(standaloneApiKeyPattern, replacement)
      .replace(authorizationAssignmentPattern, (_match, name: string, separator: string) => `${name}${separator}${replacement}`)
      .replace(credentialAssignmentPattern, (_match, name: string) => `${name}=${replacement}`)
      .replace(overlayKeyPattern, replacement)
      .replace(timerAutomationTokenPattern, replacement)
      .replace(mediaGrantPattern, replacement));
  }

  return {
    redact,
    redactText
  };

  function redactUrls(value: string): string {
    return value.replace(/(?:https?|wss?):\/\/[^\s"'<>]+|\/\/[^\s"'<>]+|\/(?:[^\s"'<>?]*)(?:\?[^\s"'<>]*)/gi, (candidate) => redactUrl(candidate));
  }

  function redactUrl(value: string): string {
    // Strip user information before parsing so even a malformed destination cannot leak it.
    const safeValue = value.replace(/^((?:https?|wss?):\/\/|\/\/)[^/?#]*@/i, "$1");
    let url: URL;

    try {
      url = new URL(safeValue, "http://stream-jams.local");
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      return safeValue.includes("?") ? replacement : safeValue;
    }

    let changed = false;
    for (const name of Array.from(url.searchParams.keys())) {
      if (sensitiveUrlParamNames.has(normalizeName(name))) {
        url.searchParams.set(name, replacement);
        changed = true;
      }
    }

    if (!changed) return safeValue;
    if (/^(?:https?|wss?):\/\//i.test(safeValue)) return url.toString();
    return `${safeValue.startsWith("//") ? `//${url.host}` : ""}${url.pathname}${url.search}${url.hash}`;
  }
}

function stripUrlUserInformation(value: string): string {
  return value.replace(/((?:https?|wss?):\/\/|\/\/)([^\s<>/?#]*)/gi, (_match, prefix: string, authority: string) => {
    const parsedAuthority = (candidate: string): URL | null => {
      try { return new URL(`${prefix === "//" ? "http://" : prefix}${candidate}`); }
      // error-provenance: allow expected -- malformed diagnostic authorities still receive bounded textual stripping
      catch { return null; }
    };
    // A valid full authority containing credentials wins over apparent JSON syntax
    // inside a password (including a numeric password and embedded property text).
    const full = parsedAuthority(authority);
    if (full !== null && /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])$/.test(full.hostname) && (full.username !== "" || full.password !== "")) return prefix + authority.slice(authority.lastIndexOf("@") + 1);
    let end = authority.length;
    for (let index = 0; index < authority.length; index += 1) {
      if (authority[index] !== '"' && authority[index] !== "'") continue;
      const suffix = authority.slice(index + 1);
      const beforeQuote = parsedAuthority(authority.slice(0, index));
      const credentialFreePrefix = beforeQuote !== null && beforeQuote.hostname !== "" && beforeQuote.username === "" && beforeQuote.password === "";
      const jsonBoundary = /^(?:[}\]]+)(?:$|,)/.test(suffix) || /^,\s*"[^"\r\n]*"\s*:\s*"(?:\\.|[^"\\])*"(?:[}\],]|$)/.test(suffix);
      if (suffix.length === 0 || (credentialFreePrefix && jsonBoundary)) { end = index; break; }
    }
    const userInformationEnd = authority.slice(0, end).lastIndexOf("@");
    return prefix + (userInformationEnd < 0 ? authority : authority.slice(userInformationEnd + 1));
  });
}
function normalizeControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- logs must not retain control bytes
  return value.replace(/[\u0000-\u001F\u007F]/g, " ");
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
