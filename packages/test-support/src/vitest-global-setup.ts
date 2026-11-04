import { enterTestRunProfile } from "./test-run-safety.js";

/** Vitest global setup; see enterTestRunProfile. */
export default function setup(): () => Promise<void> {
  return enterTestRunProfile("vt");
}
