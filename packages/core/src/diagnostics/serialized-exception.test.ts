import { describe, expect, it } from "vitest";
import {
  defaultExceptionSerializationLimits,
  serializeException,
  serializedExceptionSchema,
  type SerializedException
} from "./serialized-exception.js";

describe("serializeException", () => {
  it("serializes Error name message stack code and nested cause", () => {
    const inner = new TypeError("inner failure");
    const outer = Object.assign(new Error("outer failure", { cause: inner }), { code: "E_OUTER" });

    const result = serializeException(outer);

    expect(result).toMatchObject({
      type: "Error",
      message: "outer failure",
      code: "E_OUTER",
      thrownValue: null,
      cause: {
        type: "TypeError",
        message: "inner failure",
        code: null,
        cause: null,
        thrownValue: null
      }
    });
    expect(result.stack).toContain("Error: outer failure");
    expect(result.cause?.stack).toContain("TypeError: inner failure");
    expect(serializedExceptionSchema.parse(result)).toEqual(result);
  });

  it("serializes primitive and cross-realm error-like throws", () => {
    expect(serializeException("plain failure")).toEqual({
      type: "string",
      message: "A non-Error value was thrown.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: "plain failure"
    });

    expect(serializeException({
      name: "RemoteError",
      message: "renderer failed",
      stack: "RemoteError: renderer failed\n    at remote.js:1:1",
      code: 17,
      cause: null
    })).toEqual({
      type: "RemoteError",
      message: "renderer failed",
      stack: "RemoteError: renderer failed\n    at remote.js:1:1",
      code: "17",
      cause: null,
      thrownValue: null
    });
  });

  it("survives throwing getters and cyclic causes", () => {
    const hostile: Record<string, unknown> = {};
    for (const property of ["name", "message", "stack", "code"] as const) {
      Object.defineProperty(hostile, property, { get() { throw new Error(`${property} denied`); } });
    }
    Object.defineProperty(hostile, "cause", { get() { throw new Error("cause denied"); } });

    expect(() => serializeException(hostile)).not.toThrow();
    expect(serializeException(hostile)).toEqual({
      type: "Object",
      message: "A non-Error object was thrown.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: "[object]"
    });

    const cyclic = new Error("cycle");
    Object.defineProperty(cyclic, "cause", { value: cyclic });
    expect(serializeException(cyclic).cause).toEqual({
      type: "CircularCause",
      message: "The exception cause chain contains a cycle.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: null
    });
  });

  it("bounds depth fields and total UTF-8 bytes", () => {
    let candidate: Error = new Error("deepest");
    for (let index = 0; index < 12; index += 1) {
      candidate = new Error(`level-${index}-${"m".repeat(8_000)}`, { cause: candidate });
      candidate.stack = `Error: level-${index}\n${"s".repeat(50_000)}`;
    }

    const result = serializeException(candidate);
    let depth = 0;
    let current: SerializedException | null = result;
    while (current !== null) {
      depth += 1;
      expect(current.message.length).toBeLessThanOrEqual(defaultExceptionSerializationLimits.messageCharacters);
      expect(current.stack?.length ?? 0).toBeLessThanOrEqual(defaultExceptionSerializationLimits.stackCharacters);
      current = current.cause;
    }

    expect(depth).toBeLessThanOrEqual(defaultExceptionSerializationLimits.causeDepth + 1);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
      defaultExceptionSerializationLimits.totalUtf8Bytes
    );
  });

  it("recognizes an already serialized transport exception without inventing a new stack", () => {
    const transported: SerializedException = {
      type: "RemoteError",
      message: "worker failed",
      stack: "RemoteError: worker failed\n    at worker.js:4:2",
      code: "E_WORKER",
      cause: null,
      thrownValue: null
    };

    expect(serializeException(transported)).toEqual(transported);
  });
});
