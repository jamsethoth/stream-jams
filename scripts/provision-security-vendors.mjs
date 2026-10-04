import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, mkdtemp, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
/* global fetch */

export async function provisionVendor(entry, root, { download = fetch, extract = async (archive, destination) => promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:STREAM_JAMS_VENDOR_ARCHIVE -DestinationPath $env:STREAM_JAMS_VENDOR_DESTINATION'], { windowsHide: true, env: { ...process.env, STREAM_JAMS_VENDOR_ARCHIVE: archive, STREAM_JAMS_VENDOR_DESTINATION: destination } }) } = {}) {
  if (!/^[a-f0-9]{64}$/.test(entry.sha256) || new URL(entry.url).protocol !== 'https:') throw new Error('Vendor manifest requires HTTPS and a SHA256 digest');
  await mkdir(root, { recursive: true });
  const response = await download(entry.url);
  if (!response.ok) throw new Error(`Vendor download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Vendor archive SHA256 mismatch; extraction refused');
  const archive = join(root, 'vendor.zip');
  const destination = join(root, 'extracted');
  await writeFile(archive, bytes);
  await extract(archive, destination);
  const executable = join(destination, entry.executable);
  await access(executable).catch(error => { throw new Error('Verified archive is missing required executable', { cause: error }); });
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'win32') throw new Error('Installed security provisioning requires Windows');
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { if (@($s.GetInstalledVoices() | Where-Object Enabled).Count -eq 0) { throw 'No enabled SAPI voice' } } finally { $s.Dispose() }"], { windowsHide: true });
    const manifest = JSON.parse(await readFile(new URL('./security-vendors.json', import.meta.url), 'utf8'));
    const root = await mkdtemp(join(tmpdir(), 'stream-jams-security-vendors-'));
    const environment = {};
    for (const [name, entry] of Object.entries(manifest)) environment[entry.environment] = await provisionVendor(entry, join(root, name));
    const verifiedVendors = Object.entries(manifest).map(([name, entry]) => ({ name, version: entry.version, sha256: entry.sha256 }));
    if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, Object.entries(environment).map(([key, value]) => `${key}=${value}\n`).join(''));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, 'Verified official vendor archives\n\n' + verifiedVendors.map(entry => `- ${entry.name} ${entry.version}: SHA256 ${entry.sha256}\n`).join(''));
    process.stdout.write(JSON.stringify({ root, environment, verifiedVendors }, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
