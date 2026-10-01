// Disposable diagnostic; does not load Stream Jams production code or user data.
import { spawn } from 'node:child_process';
import { mkdir, open, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve('test-results/desktop-protocol-probe');
const source = process.env.STREAM_JAMS_PROBE_ELECTRON ?? 'C:/dev/projects/stream-jams/apps/desktop/node_modules/electron/dist/electron.exe';
await mkdir(root, { recursive: true });
// Generated 60-second mono PCM sine: 5,292,044 bytes, written in 64 KiB chunks.
const rate = 44100, samples = rate * 60, header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(samples * 2 + 36, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples * 2, 40);
const file = await open(resolve(root, 'sine.wav'), 'w');
await file.write(header);
for (let start = 0; start < samples; start += 32768) {
  const count = Math.min(32768, samples - start), chunk = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) chunk.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * 440 * (start + i) / rate)), i * 2);
  await file.write(chunk);
}
await file.close();
let executable = source, args = [resolve(here, 'desktop-protocol-probe.cjs')];
if (process.argv.includes('--packaged')) {
  const packaged = resolve(root, 'packaged');
  await cp(dirname(source), packaged, { recursive: true });
  const appDir = resolve(packaged, 'resources/app');
  await mkdir(appDir, { recursive: true });
  await cp(resolve(here, 'desktop-protocol-probe.cjs'), resolve(appDir, 'main.cjs'));
  await writeFile(resolve(appDir, 'package.json'), JSON.stringify({ name: 'stream-jams-disposable-protocol-probe', version: '1.0.0', main: 'main.cjs' }));
  executable = resolve(packaged, 'Stream Jams Probe.exe');
  await cp(resolve(packaged, 'electron.exe'), executable); args = [];
}
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [...args, `--probe-root=${root}`], { windowsHide: true, stdio: 'inherit', env: environment });
const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
const result = JSON.parse(await readFile(resolve(root, process.argv.includes('--packaged') ? 'packaged-results.json' : 'development-results.json'), 'utf8'));
if (result.error || (process.argv.includes('--packaged') && !result.packaged)) throw new Error(result.error ?? 'Packaged mode was not detected');
process.exitCode = code ?? 1;
import process from 'node:process';
import { Buffer } from 'node:buffer';
