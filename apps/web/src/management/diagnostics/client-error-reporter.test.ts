import { describe, expect, it, vi } from "vitest";
import { createClientErrorReporter, installManagementGlobalErrorListeners } from "./client-error-reporter.js";

describe("client error reporting", () => {
  it("posts one serialized exception with its stable reference", async () => {
    const postJson = vi.fn(async (...args: [string, unknown, string]) => { void args; return { referenceId: "err_client_1" }; });
    const reporter = createClientErrorReporter({ client: {
      async postJson<T>(path: string, body: unknown, fallbackMessage: string) { return postJson(path, body, fallbackMessage) as Promise<T>; }
    }, consoleError: vi.fn() });
    const exception = {
      type: "TypeError", message: "render failed", stack: "TypeError: render failed", code: null, cause: null, thrownValue: null
    };

    await reporter.report({
      referenceId: "err_client_1",
      source: "react",
      message: "The management interface stopped unexpectedly.",
      exception
    });
    await reporter.report({
      referenceId: "err_client_1",
      source: "react",
      message: "The management interface stopped unexpectedly.",
      exception
    });

    expect(postJson).toHaveBeenCalledExactlyOnceWith(
      "/management/diagnostics/client-errors",
      expect.objectContaining({ referenceId: "err_client_1", exception }),
      "Unable to record the management interface error."
    );
  });

  it("falls back once without recursively reporting a diagnostic request failure", async () => {
    const reportFailure = new Error("diagnostic endpoint unavailable");
    const postJson = vi.fn(async (...args: [string, unknown, string]) => { void args; throw reportFailure; });
    const consoleError = vi.fn();
    const reporter = createClientErrorReporter({ client: {
      async postJson<T>(path: string, body: unknown, fallbackMessage: string) { return postJson(path, body, fallbackMessage) as Promise<T>; }
    }, consoleError });
    const input = {
      referenceId: "err_client_2",
      source: "bootstrap" as const,
      message: "The management interface could not be loaded.",
      exception: { type: "Error", message: "chunk failed", stack: null, code: null, cause: null, thrownValue: null }
    };

    await expect(reporter.report(input)).resolves.toBeUndefined();
    await expect(reporter.report(input)).resolves.toBeUndefined();

    expect(postJson).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "Management exception reporting failed (err_client_2).",
      reportFailure
    );
  });

  it("reports window errors and unhandled rejections and removes its listeners", async () => {
    const report = vi.fn(async () => {});
    const references = ["err_window", "err_rejection"];
    const remove = installManagementGlobalErrorListeners({
      target: window,
      reporter: { report },
      generateReferenceId: () => references.shift() ?? "err_extra"
    });

    const windowError = new Error("window exploded");
    window.dispatchEvent(new ErrorEvent("error", { error: windowError, message: windowError.message }));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: new Error("promise exploded") });
    window.dispatchEvent(rejection);
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2));

    expect(report).toHaveBeenNthCalledWith(1, expect.objectContaining({
      referenceId: "err_window", source: "window-error", exception: expect.objectContaining({ message: "window exploded" })
    }));
    expect(report).toHaveBeenNthCalledWith(2, expect.objectContaining({
      referenceId: "err_rejection", source: "unhandled-rejection", exception: expect.objectContaining({ message: "promise exploded" })
    }));

    remove();
    expect(report).toHaveBeenCalledTimes(2);
  });
});
