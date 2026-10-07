import { afterEach, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management-http-client.js";
import { actionableError } from "./actionable-error.js";

afterEach(() => vi.restoreAllMocks());

it("preserves server reference and correction copy for actionable management failures", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const cause = new ManagementHttpError("Storage unavailable", "UNAVAILABLE", "fixture-ref", "Restart the local service.");
  expect(actionableError(cause, "Save failed", "Retry")).toMatchObject({
    summary: "Save failed", cause: "Storage unavailable", referenceId: "fixture-ref", nextStep: "Restart the local service.",
    correction: { route: "/manage/diagnostics?reference=fixture-ref" }
  });
  expect(log).toHaveBeenCalledOnce();
});
