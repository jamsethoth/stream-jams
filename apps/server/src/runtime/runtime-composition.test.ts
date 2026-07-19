import type { ActionableManagementError } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import * as runtimeComposition from "./runtime-composition.js";

type RuntimeErrorConverter = (
  providerName: string,
  status: {
    readonly state: "error";
    readonly message: string | null;
    readonly lastErrorAt: string | null;
    readonly referenceId: string | null;
  }
) => ActionableManagementError | null;

const toEventSourceRuntimeError = (runtimeComposition as {
  readonly toEventSourceRuntimeError?: RuntimeErrorConverter;
}).toEventSourceRuntimeError;

describe("toEventSourceRuntimeError", () => {
  it("keeps the inline recovery text and gates Diagnostics by the runtime reference", () => {
    expect(toEventSourceRuntimeError).toBeTypeOf("function");

    expect(toEventSourceRuntimeError!("Main Twitch", {
      state: "error",
      message: "Twitch EventSub WebSocket error",
      lastErrorAt: "2026-07-18T12:00:00.000Z",
      referenceId: null
    })).toEqual(expect.objectContaining({
      nextStep: "Review the provider connection and reconnect it before retrying.",
      referenceId: null,
      correction: null
    }));

    expect(toEventSourceRuntimeError!("Main Twitch", {
      state: "error",
      message: "Twitch EventSub WebSocket error",
      lastErrorAt: "2026-07-18T12:00:00.000Z",
      referenceId: "ref-twitch-runtime"
    })).toEqual(expect.objectContaining({
      nextStep: "Review the provider connection and reconnect it before retrying.",
      referenceId: "ref-twitch-runtime",
      correction: {
        label: "Open diagnostics",
        route: "/manage/diagnostics?reference=ref-twitch-runtime"
      }
    }));
  });
});
