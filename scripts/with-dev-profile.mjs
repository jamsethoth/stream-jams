import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import process from "node:process";

// Runs a package script in the dev profile: `node scripts/with-dev-profile.mjs <script>`.
const script = process.argv[2];
const home = process.env.STREAM_JAMS_HOME?.trim();
if (script === undefined) { console.error("Usage: node scripts/with-dev-profile.mjs <package script>"); process.exit(2); }
if (!home || !isAbsolute(home)) {
  console.error("Set STREAM_JAMS_HOME to an absolute dev folder (for example C:\\StreamJamsDev\\home) before starting the dev profile.");
  process.exit(1);
}
const child = spawn("corepack", ["pnpm", script], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: home } });
child.on("exit", code => process.exit(code ?? 1));
