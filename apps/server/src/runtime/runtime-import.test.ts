import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("imports the built runtime subpath without starting the CLI or creating a profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-import-"));
  try {
    await promisify(execFile)(process.execPath, ["--input-type=module", "-e", "const runtime = await import('@stream-jams/server/runtime'); if (typeof runtime.startLocalRuntime !== 'function') process.exitCode = 1;"], {
      cwd: resolve("apps/server"), timeout: 10_000,
      env: { ...process.env, STREAM_JAMS_CONFIG_PATH: join(root, "config.json") }
    });
    expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
