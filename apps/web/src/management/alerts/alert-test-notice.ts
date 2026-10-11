import type { AlertEditorTestResult } from "@stream-jams/core";
import type { ManagementToastNotice } from "../foundation/ManagementToast.js";

export function alertTestNotice(result: AlertEditorTestResult): ManagementToastNotice {
  if (result.status === "pending") return {
    tone: "warning",
    message: `Manual event accepted; delivery is pending. Reference ${result.busId ?? result.referenceId}.`,
    detail: "Review Event intake in Diagnostics for the accepted event. Delivery has not been confirmed; do not resend while its outcome is unknown."
  };
  const delivered = result.deliveredDestinations?.map(({ name }) => name) ?? [];
  const unavailable = result.unavailableDestinations?.map(({ name }) => name) ?? [];
  const fallback = result.targetProfileId === null ? "selected device outputs" : result.targetProfileId === "landscape" ? "Landscape" : "Vertical";
  return {
    tone: unavailable.length > 0 ? "warning" : "success",
    message: `Test queued on ${delivered.join(", ") || fallback}. Reference ${result.referenceId}.`,
    ...(unavailable.length === 0 ? {} : { detail: `Not delivered to: ${unavailable.join(", ")}. Review Audio outputs in Settings or connect and review the browser source, then retry.` })
  };
}
