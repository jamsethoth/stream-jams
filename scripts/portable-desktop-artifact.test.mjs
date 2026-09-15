import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const script = join(root, "scripts/portable-desktop-artifact.mjs");
const sha = "0123456789abcdef0123456789abcdef01234567";
const digest = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

async function withFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "stream-jams-portable-artifact-"));
  try {
    const packageDirectory = join(fixture, "Stream Jams-win32-x64");
    await mkdir(join(packageDirectory, "resources"), { recursive: true });
    await writeFile(join(packageDirectory, "Stream Jams.exe"), "fixture executable");
    await writeFile(join(packageDirectory, "resources/app.asar"), "fixture archive");
    await run({
      fixture,
      packageDirectory,
      githubOutput: join(fixture, "github-output.txt"),
      githubStepSummary: join(fixture, "github-summary.md")
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

function runScript(command, environment) {
  return spawnSync(process.execPath, [script, command], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment }
  });
}

test("prepare validates the package and emits a ref-safe traceable artifact name", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "codex/feature test",
      GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput,
      STREAM_JAMS_PORTABLE_PACKAGE_PATH: packageDirectory
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(githubOutput, "utf8"),
      `artifact-name=stream-jams-windows-x64-codex-feature-test-${sha}\n`
    );
  });
});

test("prepare accepts a successful main push", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput,
      STREAM_JAMS_PORTABLE_PACKAGE_PATH: packageDirectory
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(githubOutput, "utf8"),
      `artifact-name=stream-jams-windows-x64-main-${sha}\n`
    );
  });
});

test("prepare rejects an ineligible pull-request event", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF_NAME: "feature",
      GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput,
      STREAM_JAMS_PORTABLE_PACKAGE_PATH: packageDirectory
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not eligible for portable desktop artifact publication/i);
  });
});

test("prepare rejects a package without the runnable executable", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    await rm(join(packageDirectory, "Stream Jams.exe"));
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput,
      STREAM_JAMS_PORTABLE_PACKAGE_PATH: packageDirectory
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing packaged file: Stream Jams\.exe/i);
  });
});

test("summarize records the authenticated artifact identity and operating limits", async () => {
  await withFixture(async ({ githubStepSummary }) => {
    await mkdir(dirname(githubStepSummary), { recursive: true });
    const artifactName = `stream-jams-windows-x64-main-${sha}`;
    const artifactUrl = "https://github.com/jamsethoth/stream-jams/actions/runs/123/artifacts/456";
    const result = runScript("summarize", {
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: sha,
      GITHUB_STEP_SUMMARY: githubStepSummary,
      STREAM_JAMS_PORTABLE_ARTIFACT_NAME: artifactName,
      STREAM_JAMS_PORTABLE_ARTIFACT_URL: artifactUrl,
      STREAM_JAMS_PORTABLE_ARTIFACT_DIGEST: digest
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(githubStepSummary, "utf8"),
      [
        "### Portable Windows desktop artifact",
        "",
        `- Artifact: \`${artifactName}\``,
        "- Platform: `windows-x64`",
        "- Ref: `main`",
        `- Commit: \`${sha}\``,
        `- SHA-256: \`${digest}\``,
        `- Download: [Authenticated artifact](${artifactUrl})`,
        "- Retention: 30 days",
        "- Signing: unsigned; Windows may display a warning",
        "- Portability: application files only; user data and keyring credentials remain outside the artifact",
        ""
      ].join("\n")
    );
  });
});
