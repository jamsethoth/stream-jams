import type { AlertEditorTestResult } from "@stream-jams/core";
import type { ManagementToastNotice } from "../foundation/ManagementToast.js";

export function alertTestNotice(result: AlertEditorTestResult): ManagementToastNotice {
  const delivered = result.deliveredDestinations?.map(({ name }) => name) ?? [];
  const unavailable = result.unavailableDestinations?.map(({ name }) => name) ?? [];
  const fallback = result.targetProfileId === null ? "selected device outputs" : result.targetProfileId === "landscape" ? "Landscape" : "Vertical";
  return {
    tone: unavailable.length > 0 ? "warning" : "success",
    message: `Test queued on ${delivered.join(", ") || fallback}. Reference ${result.referenceId}.`,
    ...(unavailable.length === 0 ? {} : { detail: `Not delivered to: ${unavailable.join(", ")}. Review Audio outputs in Settings or connect and review the browser source, then retry.` })
  };
}
