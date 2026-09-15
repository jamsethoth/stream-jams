import { appendFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const eligibleEvents = new Set(["push", "workflow_dispatch"]);
const defaultPackageDirectory = resolve("apps/desktop/out/Stream Jams-win32-x64");

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireSha(value, length, label) {
  const pattern = new RegExp(`^[0-9a-f]{${length}}$`, "i");
  if (!pattern.test(value)) throw new Error(`${label} must be ${length} hexadecimal characters`);
  return value.toLowerCase();
}

function slugRef(value) {
  const slug = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120)
    .replace(/[.-]+$/g, "");
  if (!slug) throw new Error("GITHUB_REF_NAME does not contain a usable artifact-name segment");
  return slug;
}

function markdownCode(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
}

async function requireFile(packageDirectory, relativePath) {
  const path = join(packageDirectory, relativePath);
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error(`Missing packaged file: ${relativePath}`);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Missing packaged file: ${relativePath}`, { cause: error });
    throw error;
  }
}

async function prepare() {
  const eventName = requireEnvironment("GITHUB_EVENT_NAME");
  if (!eligibleEvents.has(eventName)) {
    throw new Error(`${eventName} is not eligible for portable desktop artifact publication`);
  }

  const refName = requireEnvironment("GITHUB_REF_NAME");
  const sha = requireSha(requireEnvironment("GITHUB_SHA"), 40, "GITHUB_SHA");
  const githubOutput = requireEnvironment("GITHUB_OUTPUT");
  const packageDirectory = resolve(process.env.STREAM_JAMS_PORTABLE_PACKAGE_PATH ?? defaultPackageDirectory);
  const packageDetails = await stat(packageDirectory).catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`Missing packaged directory: ${packageDirectory}`, { cause: error });
    }
    throw error;
  });
  if (!packageDetails.isDirectory()) throw new Error(`Packaged path is not a directory: ${packageDirectory}`);

  await requireFile(packageDirectory, "Stream Jams.exe");
  await requireFile(packageDirectory, "resources/app.asar");

  const artifactName = `stream-jams-windows-x64-${slugRef(refName)}-${sha}`;
  await appendFile(githubOutput, `artifact-name=${artifactName}\n`, "utf8");
  process.stdout.write(`Prepared portable desktop artifact metadata for ${artifactName}.\n`);
}

async function summarize() {
  const artifactName = requireEnvironment("STREAM_JAMS_PORTABLE_ARTIFACT_NAME");
  const artifactUrl = requireEnvironment("STREAM_JAMS_PORTABLE_ARTIFACT_URL");
  const artifactDigest = requireSha(
    requireEnvironment("STREAM_JAMS_PORTABLE_ARTIFACT_DIGEST"),
    64,
    "STREAM_JAMS_PORTABLE_ARTIFACT_DIGEST"
  );
  const refName = requireEnvironment("GITHUB_REF_NAME");
  const sha = requireSha(requireEnvironment("GITHUB_SHA"), 40, "GITHUB_SHA");
  const githubStepSummary = requireEnvironment("GITHUB_STEP_SUMMARY");

  if (!/^stream-jams-windows-x64-[A-Za-z0-9._-]+-[0-9a-f]{40}$/i.test(artifactName)) {
    throw new Error("STREAM_JAMS_PORTABLE_ARTIFACT_NAME is not a traceable Windows x64 artifact name");
  }
  const parsedUrl = new URL(artifactUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "github.com") {
    throw new Error("STREAM_JAMS_PORTABLE_ARTIFACT_URL must be an authenticated github.com URL");
  }

  const summary = [
    "### Portable Windows desktop artifact",
    "",
    `- Artifact: \`${markdownCode(artifactName)}\``,
    "- Platform: `windows-x64`",
    `- Ref: \`${markdownCode(refName)}\``,
    `- Commit: \`${sha}\``,
    `- SHA-256: \`${artifactDigest}\``,
    `- Download: [Authenticated artifact](${artifactUrl})`,
    "- Retention: 30 days",
    "- Signing: unsigned; Windows may display a warning",
    "- Portability: application files only; user data and keyring credentials remain outside the artifact",
    ""
  ].join("\n");
  await appendFile(githubStepSummary, summary, "utf8");
  process.stdout.write(`Recorded portable desktop artifact summary for ${artifactName}.\n`);
}

const command = process.argv[2];
try {
  if (command === "prepare") await prepare();
  else if (command === "summarize") await summarize();
  else throw new Error("Usage: node scripts/portable-desktop-artifact.mjs <prepare|summarize>");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
