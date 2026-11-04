import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { testCredentialPrefixPattern } from "./environment-safety.js";

export type CommandRunner = (file: string, args: readonly string[]) => Promise<string>;

const runCommand: CommandRunner = async (file, args) => (await promisify(execFile)(file, [...args], { windowsHide: true, timeout: 30_000 })).stdout;

/**
 * Windows Credential Manager targets written by the keyring adapter look like
 * `<account>.<prefix>:<namespace>:<name>`. Returns the targets for one test prefix
 * (or a run's family of prefixes, `<prefix>-*`), never anything else.
 */
export function testCredentialTargets(cmdkeyList: string, prefix: string): string[] {
  if (!testCredentialPrefixPattern.test(prefix)) throw new Error(`Refusing to match credentials for non-test prefix "${prefix}".`);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const target = new RegExp(`^\\s*Target:\\s*(?:LegacyGeneric:target=)?([A-Za-z0-9_-]+\\.${escaped}(?:-[A-Za-z0-9_-]+)?:[a-z]+:[A-Za-z0-9_-]+)\\s*$`, "u");
  return cmdkeyList.split(/\r?\n/u).flatMap(line => { const match = target.exec(line); return match === null ? [] : [match[1]!]; });
}

/** Deletes every Credential Manager entry for a test prefix. A no-op off Windows. */
export async function removeTestCredentials(prefix: string, run: CommandRunner = runCommand, platform: NodeJS.Platform = process.platform): Promise<number> {
  if (!testCredentialPrefixPattern.test(prefix)) throw new Error(`Refusing to remove credentials for non-test prefix "${prefix}".`);
  if (platform !== "win32") return 0;
  const targets = testCredentialTargets(await run("cmdkey.exe", ["/list"]), prefix);
  for (const target of targets) await run("cmdkey.exe", [`/delete:${target}`]);
  return targets.length;
}
