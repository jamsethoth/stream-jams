import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const runnerPackagePath = require.resolve("@storybook/test-runner/package.json");
const runnerPackage = JSON.parse(await readFile(runnerPackagePath, "utf8"));
const runnerBin = typeof runnerPackage.bin === "string" ? runnerPackage.bin : runnerPackage.bin?.["test-storybook"];

if (typeof runnerBin !== "string") {
  throw new Error("Unable to resolve the Storybook test-runner executable");
}

const runnerPath = path.resolve(path.dirname(runnerPackagePath), runnerBin);
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [runnerPath, ...process.argv.slice(2)], {
    env: {
      ...process.env,
      TEST_MATCH: "**/apps/web/src/**/*.stories.@(ts|tsx|mdx)"
    },
    stdio: "inherit"
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
