import type { ActionableManagementError } from "@stream-jams/core";

/** Preserve server correction context at the management presentation boundary. */
export function actionableError(error: unknown, summary: string, nextStep: string): ActionableManagementError {
  const referenceId = readString(error, "referenceId") ?? `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.error(`[${referenceId}] ${summary}`, error);
  return {
    summary,
    cause: error instanceof Error ? error.message : "The request failed for an unknown reason.",
    nextStep: readString(error, "nextStep") ?? nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId,
    correction: { label: "Open Diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}` }
  };
}

function readString(error: unknown, property: "referenceId" | "nextStep"): string | null {
  if (typeof error !== "object" || error === null || !(property in error)) return null;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
