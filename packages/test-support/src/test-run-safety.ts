import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeTestEnvironment, createTestRunId } from "./environment-safety.js";
import { removeTestCredentials } from "./test-credentials.js";

/**
 * Global setup shared by Vitest and every Playwright config. It refuses an environment that
 * points at production, then puts the whole run in the test profile with its own home and a
 * run-scoped credential prefix, so code that reads `process.env` can never reach production.
 * The returned teardown removes every credential the run created, including after failures.
 */
export function enterTestRunProfile(label: string): () => Promise<void> {
  assertSafeTestEnvironment(process.env);
  const runId = `${label}-${createTestRunId()}`;
  const home = mkdtempSync(join(tmpdir(), `stream-jams-test-${label}-`));
  const prefix = `stream-jams-test-${runId}`;
  Object.assign(process.env, { STREAM_JAMS_PROFILE: "test", STREAM_JAMS_HOME: home, STREAM_JAMS_KEYRING_PREFIX: prefix, STREAM_JAMS_TEST_RUN_ID: runId });
  delete process.env.STREAM_JAMS_CONFIG_PATH;
  delete process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH;
  return async () => {
    const removed = await removeTestCredentials(prefix);
    if (removed > 0) console.info(`Removed ${removed} credential(s) left by test run ${runId}.`);
    rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
}
