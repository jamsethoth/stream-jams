import { enterTestRunProfile } from "./test-run-safety.js";

/** Shared by every Playwright config; see enterTestRunProfile. */
export default function globalSetup(): () => Promise<void> {
  return enterTestRunProfile("pw");
}
