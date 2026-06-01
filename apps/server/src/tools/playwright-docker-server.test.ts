import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const scriptPath = fileURLToPath(new URL("../../../../scripts/playwright-docker-server.mjs", import.meta.url));

function runDockerServerScript(env: NodeJS.ProcessEnv): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("playwright Docker server helper", () => {
  test("prints a concise error when the docker command is unavailable", async () => {
    const emptyPathDirectory = await mkdtemp(join(tmpdir(), "stream-jams-no-docker-"));

    const result = await runDockerServerScript({
      ...process.env,
      PATH: emptyPathDirectory,
      Path: emptyPathDirectory
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Docker is required for playwright:docker-server, but the docker command was not found."
    );
    expect(result.stderr).not.toContain("Unhandled 'error' event");
  });
});
