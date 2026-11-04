import { join } from "node:path";
import { assertSafeTestEnvironment } from "../../packages/test-support/src/environment-safety.js";

let launches = 0;

/**
 * The only way desktop specs build the environment for an Electron or packaged Stream Jams
 * process. Every launch runs in the test profile with its own home, Electron profile and
 * credential prefix inside the run's prefix family, which the global teardown removes.
 * `tests/desktop-isolation-check.test.mjs` fails any spec that launches without it.
 */
export function isolatedDesktopEnvironment(root: string, extra: Record<string, string> = {}): Record<string, string> {
  const runId = process.env.STREAM_JAMS_TEST_RUN_ID;
  if (runId === undefined) throw new Error("Desktop specs must run through a Playwright config with packages/test-support/src/playwright-global-setup.ts.");
  launches += 1;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.STREAM_JAMS_CONFIG_PATH;
  Object.assign(env, {
    STREAM_JAMS_PROFILE: "test",
    STREAM_JAMS_HOME: root,
    STREAM_JAMS_KEYRING_PREFIX: `stream-jams-test-${runId}-${launches}`,
    STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron")
  }, extra);
  assertSafeTestEnvironment(env);
  return env;
}
