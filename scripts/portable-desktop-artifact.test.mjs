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
    assert.match(await readFile(join(packageDirectory, "BUILD-STATUS.txt"), "utf8"), /not desktop-test-verified/i);
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

test("prepare publishes a traceable pull-request artifact", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "pull_request", GITHUB_REF_NAME: "135/merge", GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput, STREAM_JAMS_PORTABLE_PACKAGE_PATH: packageDirectory
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(githubOutput, "utf8"), `artifact-name=stream-jams-windows-x64-135-merge-${sha}\n`);
  });
});

test("prepare rejects an ineligible event", async () => {
  await withFixture(async ({ packageDirectory, githubOutput }) => {
    const result = runScript("prepare", {
      GITHUB_EVENT_NAME: "schedule",
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
        "- Validation: built, not desktop-test-verified; see the separate windows-desktop job",
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

test("prepare-installer requires the built Setup.exe and emits a traceable installer name", async () => {
  await withFixture(async ({ fixture, githubOutput }) => {
    const installerPath = join(fixture, "installer", "StreamJamsSetup.exe");
    const environment = {
      GITHUB_EVENT_NAME: "pull_request", GITHUB_REF_NAME: "135/merge", GITHUB_SHA: sha,
      GITHUB_OUTPUT: githubOutput, STREAM_JAMS_INSTALLER_PATH: installerPath
    };
    const missing = runScript("prepare-installer", environment);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /missing installer/i);

    await mkdir(dirname(installerPath), { recursive: true });
    await writeFile(installerPath, "fixture installer");
    const result = runScript("prepare-installer", environment);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(githubOutput, "utf8"), `installer-artifact-name=stream-jams-windows-x64-installer-135-merge-${sha}\n`);

    const ineligible = runScript("prepare-installer", { ...environment, GITHUB_EVENT_NAME: "schedule" });
    assert.notEqual(ineligible.status, 0);
    assert.match(ineligible.stderr, /not eligible/i);
  });
});

test("summarize-installer records the unsigned installer identity and rejects a portable name", async () => {
  await withFixture(async ({ githubStepSummary }) => {
    const artifactName = `stream-jams-windows-x64-installer-main-${sha}`;
    const artifactUrl = "https://github.com/jamsethoth/stream-jams/actions/runs/123/artifacts/789";
    const environment = {
      GITHUB_REF_NAME: "main", GITHUB_SHA: sha, GITHUB_STEP_SUMMARY: githubStepSummary,
      STREAM_JAMS_INSTALLER_ARTIFACT_NAME: artifactName, STREAM_JAMS_INSTALLER_ARTIFACT_URL: artifactUrl, STREAM_JAMS_INSTALLER_ARTIFACT_DIGEST: digest
    };
    const result = runScript("summarize-installer", environment);
    assert.equal(result.status, 0, result.stderr);
    const summary = await readFile(githubStepSummary, "utf8");
    assert.match(summary, /^### Unsigned Windows desktop installer\n/);
    assert.ok(summary.includes(`- Artifact: \`${artifactName}\``));
    assert.ok(summary.includes(`- SHA-256: \`${digest}\``));
    assert.ok(summary.includes(`- Download: [Authenticated artifact](${artifactUrl})`));
    assert.match(summary, /- Signing: unsigned; Windows SmartScreen shows a warning/);
    assert.match(summary, /preserved on uninstall/);

    const portableName = runScript("summarize-installer", { ...environment, STREAM_JAMS_INSTALLER_ARTIFACT_NAME: `stream-jams-windows-x64-main-${sha}` });
    assert.notEqual(portableName.status, 0);
    assert.match(portableName.stderr, /not a traceable Windows x64 installer artifact name/);

    const foreignUrl = runScript("summarize-installer", { ...environment, STREAM_JAMS_INSTALLER_ARTIFACT_URL: "https://example.com/setup.exe" });
    assert.notEqual(foreignUrl.status, 0);
    assert.match(foreignUrl.stderr, /authenticated github\.com URL/);
  });
});
