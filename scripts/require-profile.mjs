import process from "node:process";

// Development entry points run only with an explicit profile, so a bare `pnpm dev` can never
// start against the production Stream Jams data, credentials and port on the streaming PC.
const profile = process.env.STREAM_JAMS_PROFILE?.trim();
if (!profile) {
  console.error("STREAM_JAMS_PROFILE is not set. Use `corepack pnpm dev:isolated` or `corepack pnpm start:dev` (dev profile, needs STREAM_JAMS_HOME),\nor set STREAM_JAMS_PROFILE=production explicitly to use the production profile.");
  process.exit(1);
}
