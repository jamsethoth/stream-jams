import { withCleanup } from "./audio-harness.js";

export async function withShutdownEvidence(action: () => Promise<void>, cleanup: () => Promise<void>, retain: () => Promise<void>): Promise<void> {
  try {
    await withCleanup(action, cleanup);
  } finally {
    // Failure evidence must never replace the action/cleanup result.
    try { await retain(); }
    catch (error) { console.info("Shutdown evidence attachment failed:", error); }
  }
}
