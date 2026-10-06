import { DefaultAssetValidator, type ActionableManagementError } from "@stream-jams/core";
import type { ManagementApi } from "../management-api.js";

export type AssetLibraryManagementApi = Pick<
  ManagementApi,
  "listAssetLibraryItems" | "updateAssetMetadata" | "getAssetChangeImpact" | "deleteAsset"
>;

export function parseTags(value: string): readonly string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export async function validateAssetFile(file: File) {
  return new DefaultAssetValidator().validate({
    originalFileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    bytes: new Uint8Array(await file.arrayBuffer())
  });
}

export function uploadError(reason: string | null): ActionableManagementError {
  const referenceId = `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const cause = reason ?? "The selected file is invalid.";
  console.info(`[${referenceId}] Asset upload validation failed: ${cause}`);
  return {
    summary: "This file cannot be uploaded",
    cause,
    nextStep: "Choose a supported file and keep it within the limit shown for its type.",
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId,
    correction: { label: "Open Diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}` }
  };
}

export { actionableError } from "../foundation/actionable-error.js";
