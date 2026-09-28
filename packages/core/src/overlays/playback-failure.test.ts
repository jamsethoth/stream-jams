import { describe, expect, it } from "vitest";
import { overlayPlaybackFailureSchema } from "./playback-failure.js";

describe("overlayPlaybackFailureSchema", () => {
  const valid = {
    referenceId: "err_12345678-1234-1234-1234-123456789abc",
    stage: "seek",
    message: "Video playback could not start at the shared offset.",
    exception: {
      type: "InvalidStateError",
      message: "seek denied",
      stack: null,
      code: null,
      cause: null,
      thrownValue: null
    }
  };

  it("accepts the bounded playback stages and strict serialized exception contract", () => {
    expect(overlayPlaybackFailureSchema.parse(valid)).toEqual(valid);
    expect(overlayPlaybackFailureSchema.safeParse({ ...valid, stage: "other" }).success).toBe(false);
    expect(overlayPlaybackFailureSchema.safeParse({ ...valid, clientId: "spoofed" }).success).toBe(false);
  });

  it("rejects oversized failure messages and exception fields", () => {
    expect(overlayPlaybackFailureSchema.safeParse({ ...valid, message: "x".repeat(1025) }).success).toBe(false);
    expect(overlayPlaybackFailureSchema.safeParse({
      ...valid,
      exception: { ...valid.exception, stack: "x".repeat(32769) }
    }).success).toBe(false);
  });
});
