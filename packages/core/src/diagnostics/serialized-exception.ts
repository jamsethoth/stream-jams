import { z } from "zod";

export interface SerializedException {
  readonly type: string;
  readonly message: string;
  readonly stack: string | null;
  readonly code: string | null;
  readonly cause: SerializedException | null;
  readonly thrownValue: string | null;
}

export interface ExceptionSerializationLimits {
  readonly causeDepth: number;
  readonly messageCharacters: number;
  readonly stackCharacters: number;
  readonly thrownValueCharacters: number;
  readonly totalUtf8Bytes: number;
}

export const defaultExceptionSerializationLimits: ExceptionSerializationLimits = {
  causeDepth: 5,
  messageCharacters: 4_096,
  stackCharacters: 32_768,
  thrownValueCharacters: 4_096,
  totalUtf8Bytes: 65_536
};

const exceptionNodeSchema: z.ZodType<SerializedException> = z.lazy(() => z.object({
  type: z.string().min(1).max(256),
  message: z.string().max(defaultExceptionSerializationLimits.messageCharacters),
  stack: z.string().max(defaultExceptionSerializationLimits.stackCharacters).nullable(),
  code: z.string().max(256).nullable(),
  cause: exceptionNodeSchema.nullable(),
  thrownValue: z.string().max(defaultExceptionSerializationLimits.thrownValueCharacters).nullable()
}).strict());

export const serializedExceptionSchema = exceptionNodeSchema.superRefine((value, context) => {
  if (utf8Length(JSON.stringify(value)) > defaultExceptionSerializationLimits.totalUtf8Bytes) {
    context.addIssue({
      code: "custom",
      message: `Serialized exception exceeds ${defaultExceptionSerializationLimits.totalUtf8Bytes} UTF-8 bytes`
    });
  }
});

const inaccessible = Symbol("inaccessible");

export function serializeException(
  value: unknown,
  overrides: Partial<ExceptionSerializationLimits> = {}
): SerializedException {
  const limits = normalizeLimits(overrides);

  try {
    const transported = readTransportedException(value);
    if (transported !== null) {
      return fitTotalSize(transported, limits);
    }

    return fitTotalSize(serializeValue(value, limits, new WeakSet<object>(), 0), limits);
  } catch {
    return fallbackException("ExceptionSerializationError", "The exception could not be serialized.");
  }
}

function serializeValue(
  value: unknown,
  limits: ExceptionSerializationLimits,
  seen: WeakSet<object>,
  depth: number
): SerializedException {
  if (depth >= limits.causeDepth) {
    return fallbackException("CauseDepthLimit", "The exception cause chain exceeded the configured depth.");
  }

  if (!isObject(value)) {
    return {
      type: value === null ? "null" : typeof value,
      message: "A non-Error value was thrown.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: truncate(renderPrimitive(value), limits.thrownValueCharacters)
    };
  }

  if (seen.has(value)) {
    return fallbackException("CircularCause", "The exception cause chain contains a cycle.");
  }
  seen.add(value);

  const name = readProperty(value, "name");
  const message = readProperty(value, "message");
  const stack = readProperty(value, "stack");
  const code = readProperty(value, "code");
  const cause = readProperty(value, "cause");
  const errorLike = value instanceof Error || typeof message === "string";

  if (!errorLike) {
    return {
      type: safeConstructorName(value),
      message: "A non-Error object was thrown.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: "[object]"
    };
  }

  return {
    type: truncate(
      typeof name === "string" && name.trim() !== "" ? name : safeConstructorName(value),
      256
    ),
    message: truncate(typeof message === "string" ? message : "An exception was thrown.", limits.messageCharacters),
    stack: typeof stack === "string" ? truncate(stack, limits.stackCharacters) : null,
    code: typeof code === "string" || typeof code === "number" ? truncate(String(code), 256) : null,
    cause: cause === inaccessible || cause === undefined || cause === null
      ? null
      : serializeValue(cause, limits, seen, depth + 1),
    thrownValue: null
  };
}

function readTransportedException(value: unknown): SerializedException | null {
  if (!isObject(value)) return null;
  try {
    const parsed = serializedExceptionSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readProperty(value: object, property: string): unknown | typeof inaccessible {
  try {
    return Reflect.get(value, property);
  } catch {
    return inaccessible;
  }
}

function safeConstructorName(value: object): string {
  const constructor = readProperty(value, "constructor");
  if (typeof constructor === "function") {
    const name = readProperty(constructor, "name");
    if (typeof name === "string" && name.trim() !== "") return truncate(name, 256);
  }
  return "Object";
}

function fitTotalSize(value: SerializedException, limits: ExceptionSerializationLimits): SerializedException {
  if (utf8Length(JSON.stringify(value)) <= limits.totalUtf8Bytes) return value;

  const bounded: SerializedException = {
    ...value,
    stack: null,
    cause: value.cause === null
      ? null
      : fallbackException("CauseSizeLimit", "The exception cause chain exceeded the configured size.")
  };
  if (utf8Length(JSON.stringify(bounded)) <= limits.totalUtf8Bytes) return bounded;

  const minimal = {
    ...bounded,
    message: truncate(bounded.message, Math.min(limits.messageCharacters, 512)),
    code: bounded.code === null ? null : truncate(bounded.code, 64),
    cause: null,
    thrownValue: bounded.thrownValue === null
      ? null
      : truncate(bounded.thrownValue, Math.min(limits.thrownValueCharacters, 512))
  };
  return utf8Length(JSON.stringify(minimal)) <= limits.totalUtf8Bytes
    ? minimal
    : fallbackException("ExceptionSizeLimit", "The exception exceeded the configured size.");
}

function normalizeLimits(overrides: Partial<ExceptionSerializationLimits>): ExceptionSerializationLimits {
  return {
    causeDepth: positiveInteger(overrides.causeDepth, defaultExceptionSerializationLimits.causeDepth),
    messageCharacters: positiveInteger(overrides.messageCharacters, defaultExceptionSerializationLimits.messageCharacters),
    stackCharacters: positiveInteger(overrides.stackCharacters, defaultExceptionSerializationLimits.stackCharacters),
    thrownValueCharacters: positiveInteger(
      overrides.thrownValueCharacters,
      defaultExceptionSerializationLimits.thrownValueCharacters
    ),
    totalUtf8Bytes: Math.max(512, positiveInteger(
      overrides.totalUtf8Bytes,
      defaultExceptionSerializationLimits.totalUtf8Bytes
    ))
  };
}

function positiveInteger(candidate: number | undefined, fallback: number): number {
  return candidate !== undefined && Number.isInteger(candidate) && candidate > 0 ? candidate : fallback;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const marker = "…[truncated]";
  return limit <= marker.length ? marker.slice(0, limit) : `${value.slice(0, limit - marker.length)}${marker}`;
}

function renderPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.description === undefined ? "Symbol()" : `Symbol(${value.description})`;
  if (typeof value === "function") return value.name === "" ? "[function]" : `[function ${value.name}]`;
  return String(value);
}

function fallbackException(type: string, message: string): SerializedException {
  return { type, message, stack: null, code: null, cause: null, thrownValue: null };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
