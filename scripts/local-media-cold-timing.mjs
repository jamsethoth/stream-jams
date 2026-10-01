/* global AbortController */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createNativeProbe } from './local-media-cold-native.mjs';
import { captureDiagnostic, createTraceProbe, traceHelper } from './local-media-cold-trace.mjs';
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

// Populate only after reviewing command evidence from the official package for
// this exact signed binary. An arbitrary caller-supplied JSON is not evidence.
export const verifiedRamMapCapabilities = Object.freeze({
  e970913798481432cd590991577089e68510b861dc669dcab24feb06aae0df52: {
    version: '1.63', commands: ['-Es', '-Et'],
    source: 'https://download.sysinternals.com/files/RAMMap.zip',
    evidence: 'Reviewed UTF16 help resources in valid Microsoft-signed RAMMap64.exe: Command line mode: Rammap -E[wsmt0]; -Es Empty System Working Sets; -Et Empty Standby List. No executable was launched for inspection.'
  }
});
const chunkSize = 65536;

export function parseOptions(args) {
  const options = { pairs: 1, execute: false, acknowledge: false, warmOnly: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--execute-cache-purge') options.execute = true;
    else if (arg === '--acknowledge-system-wide-cache-purge') options.acknowledge = true;
    else if (arg === '--measure-warm') { options.execute = true; options.warmOnly = true; }
    else if (arg === '--verify-tracing') { options.execute = true; options.verifyTracing = true; }
    else if (['--pairs', '--rammap', '--output'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing ${arg} value`);
      options[{ '--pairs': 'pairs', '--rammap': 'rammap', '--output': 'output' }[arg]] = arg === '--pairs' ? Number(value) : value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.pairs) || options.pairs < 1 || options.pairs > 3) throw new Error('pairs must be an integer from 1 to 3');
  if (options.warmOnly && args.includes('--execute-cache-purge')) throw new Error('Choose warm measurement or cache purge');
  if (options.verifyTracing && (options.warmOnly || args.includes('--execute-cache-purge'))) throw new Error('Choose tracing verification, warm measurement or cache purge');
  return options;
}

export async function runColdTiming(options, adapter) {
  const result = { schemaVersion: 3, outcome: 'dry-run', startedAt: new Date().toISOString(), nodeVersion: process.version,
    scope: 'Packaged integrity verification followed by muted native audio clock advancement, using fully materialized valid MP4 fixtures.',
    cacheState: 'unchanged; purge not attempted', pairs: options.pairs, rows: [], storageReads: [], purgeRequests: [], cleanup: 'not-needed',
    limitations: ['Exact-file DiskIO read evidence describes storage reads, not guaranteed physical-media access or complete cache eviction.', 'Muted native clock advancement does not establish physical sound or OBS acceptance.', 'Packaged internal counters and standalone integrity duration are not exposed by production IPC.'],
    plan: ['Validate local prerequisites', 'Acquire exclusive local lock', 'Prepare isolated packaged fixtures', 'Verify exact-file ETW mapping with a nonpurging positive control and owned trace cleanup', 'Capture positive controls before reviewed -Es/-Et, native request-to-onset and warm-repeat windows', 'Stop and analyze only owned traces; preserve evidence and release lock'] };
  if (!options.execute) return result;
  if (!options.warmOnly && !options.verifyTracing && !options.acknowledge) return { ...result, outcome: 'blocked', error: 'Explicit system-wide cache-purge acknowledgement required' };
  let locked = false, prepared = false;
  try {
    options.signal?.throwIfAborted();
    result.tool = await adapter.preflight(options);
    await adapter.lock(); locked = true;
    result.outcome = 'failed';
    prepared = true; await adapter.prepare(options.signal);
    if (!options.warmOnly) {
      result.tracingVerification = await adapter.verifyTracing(options.signal);
      if (result.tracingVerification.status !== 'verified-file-read-mapping') throw new Error('ETW exact-file positive control failed; purge blocked');
    }
    if (options.verifyTracing) { result.outcome = 'completed'; result.cacheState = 'unchanged; nonpurging trace verification'; }
    else {
    for (let pair = 0; pair < options.pairs; pair++) {
      options.signal?.throwIfAborted();
      if (!options.warmOnly) {
        await adapter.startTrace(options.signal);
        await adapter.purge(options.signal, event => { result.purgeRequests.push(event); result.cacheState = 'partial purge requested, not proven cold'; });
      } else result.cacheState = 'uncontrolled; no purge';
      const rows = [];
      for (const pass of [options.warmOnly ? 'uncontrolled-after-preprobe' : 'cache-purge-requested', 'warm-repeat']) {
        options.signal?.throwIfAborted();
        const measured = await adapter.measure(pass, options.signal);
        if (measured.cleanup?.nativeElements !== 0) throw new Error('Native media did not detach');
        const row = { pair: pair + 1, pass, ...measured }; result.rows.push(row); rows.push(row);
      }
      if (!options.warmOnly) result.storageReads.push({ pair: pair + 1, ...await adapter.finishTrace(rows) });
    }
    result.outcome = !options.warmOnly && result.storageReads.some(proof => proof.status !== 'observed-storage-read') ? 'inconclusive' : 'completed';
    if (!options.warmOnly) result.cacheState = result.outcome === 'completed' ? 'observed exact-file storage reads after purge request' : 'inconclusive storage-read evidence';
    }
  } catch (error) {
    result.outcome = options.signal?.aborted ? 'cancelled' : locked ? 'failed' : 'blocked';
    result.error = error.message;
    if (error.captureDiagnostic) result.captureDiagnostic = error.captureDiagnostic;
  } finally {
    if (prepared) {
      try { result.processCleanup = await adapter.cleanup(); result.cleanup = 'completed'; }
      catch (error) { result.cleanup = 'failed'; result.outcome = 'failed'; result.cleanupError = error.message; result.processCleanup = error.cleanupEvidence; }
    }
    if (locked) {
      try {
        if (result.cleanup === 'failed') result.machineLock = await adapter.retainLock({ pid: process.pid, retainedAt: new Date().toISOString(), cleanupError: result.cleanupError, cleanupEvidence: result.processCleanup,
          recovery: 'Confirm the recorded owned helper/session and packaged processes have exited before removing this exact machine lock. Never stop unrelated sessions.' });
        else await adapter.unlock();
      } catch (error) { result.outcome = 'failed'; result.lockError = error.message; }
      result.finishedAt = new Date().toISOString();
      await adapter.save(result);
    }
  }
  return result;
}

// Direct executables, fixed argument arrays, no shell, no visible window. A
// deadline/cancellation kills only this runner's child; it never retries purge.
export function runChild(executable, args, { signal, timeoutMs = 15_000, sanitizeErrors = false } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, ...(signal ? { signal } : {}) });
    let stdout = '', stderr = '', childError;
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16384); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
    child.once('error', error => { childError = error; });
    // Await close even after AbortError so cleanup never races an owned child.
    child.once('close', (code, termination) => {
      if (childError) reject(childError);
      else if (code === 0) accept(stdout);
      else {
        const diagnostic = captureDiagnostic(stdout);
        const error = new Error(`Owned child failed (${termination ?? code}): ${diagnostic ? `${diagnostic.errorType}; nativeErrorCode=${diagnostic.nativeErrorCode}` : sanitizeErrors ? 'No structured helper diagnostic' : stderr.slice(-512)}`);
        error.captureDiagnostic = diagnostic; reject(error);
      }
    });
  });
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: chunkSize })) hash.update(chunk);
  return hash.digest('hex');
}

async function removeFixtures(directory) {
  const target = resolve(directory), parent = resolve(tmpdir()) + sep;
  if (!target.startsWith(parent) || !basename(target).startsWith('stream-jams-cold-timing-')) throw new Error('Unsafe fixture cleanup path');
  await rm(target, { recursive: true, force: true });
}

export function createAdapter(options, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform, env = dependencies.env ?? process.env;
  const hash = dependencies.hashFile ?? hashFile, child = dependencies.runChild ?? runChild, read = dependencies.readFile ?? readFile;
  const output = resolve(options.output ?? 'apps/desktop/out/local-media-cold-timing');
  const lockPath = dependencies.lockPath ?? join(tmpdir(), 'stream-jams-local-media-cold-timing.lock');
  let lock, directory, native, tool, trace, helperSha256;
  const executablePath = resolve('apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe');
  return {
    async preflight() {
      if (env.CI) throw new Error('Local runner is disabled in CI');
      // Fail before any mutation if production build is unavailable.
      await read(new URL('../apps/server/dist/modules/assets/local-media-service.js', import.meta.url));
      await read(executablePath);
      const packageSha256 = await hash(join(resolve(executablePath, '..'), 'resources', 'app.asar'));
      const executableSha256 = await hash(executablePath);
      if (options.warmOnly) return { mode: 'warm-only', platform, packageSha256, executableSha256 };
      if (platform !== 'win32') throw new Error('Cache purge requires Windows');
      try { await read(traceHelper); } catch { throw new Error('ETW helper must be built before measurement: dotnet build scripts/local-media-etw/LocalMediaEtw.csproj -c Release; no runtime build/download'); }
      helperSha256 = await hash(traceHelper);
      const tracing = JSON.parse(await child('dotnet', [traceHelper, 'preflight'], { signal: options.signal, sanitizeErrors: true }));
      if (tracing.schemaVersion !== 1 || tracing.status !== 'preflight' || tracing.library !== 'Microsoft.Diagnostics.Tracing.TraceEvent' || tracing.libraryVersion !== '3.2.8' || tracing.windowsSupported !== true || tracing.captureSupported !== true || tracing.elevated !== true) throw new Error('ETW requires supported Windows, reviewed TraceEvent 3.2.8 and an already elevated terminal');
      if (options.verifyTracing) return { mode: 'verify-tracing', tracing, helperSha256, packageSha256, executableSha256 };
      if (!options.rammap || basename(options.rammap).toLowerCase() !== 'rammap64.exe') throw new Error('Supply existing RAMMap64.exe; no automatic download/install');
      const path = resolve(options.rammap), sha256 = await hash(path);
      const capability = verifiedRamMapCapabilities[sha256];
      if (!capability) throw new Error('No reviewed command evidence for this RAMMap64 SHA256; real purge is blocked');
      // Path is base64 transported data, never interpolated as PowerShell code.
      const encoded = Buffer.from(path, 'utf8').toString('base64');
      const script = `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $s=Get-AuthenticodeSignature -LiteralPath $p; $v=(Get-Item -LiteralPath $p).VersionInfo; $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); @{status=[string]$s.Status;subject=$s.SignerCertificate.Subject;version=$v.FileVersion;elevated=$admin;eula=(Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Sysinternals\\RAMMap' -Name EulaAccepted -ErrorAction SilentlyContinue).EulaAccepted} | ConvertTo-Json -Compress`;
      const ps = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const metadata = JSON.parse(await child(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { signal: options.signal }));
      if (metadata.status !== 'Valid' || !/O=Microsoft Corporation(?:,|$)/.test(metadata.subject ?? '') || metadata.version !== capability.version || !metadata.elevated || metadata.eula !== 1) throw new Error('Requires reviewed version, valid Microsoft signature, existing elevated terminal and previously accepted RAMMap EULA');
      tool = { path, sha256, ...metadata, evidence: capability };
      return { sha256, ...metadata, evidence: capability, tracing, helperSha256, packageSha256, executableSha256 };
    },
    async lock() {
      lock = await open(lockPath, 'wx');
      try { await lock.writeFile(`pid=${process.pid}\n`); }
      catch (error) { await lock.close(); await rm(lockPath); throw error; }
    },
    async prepare(signal) {
      await mkdir(output, { recursive: true });
      const probe = join(output, `.writability-${process.pid}`);
      await writeFile(probe, '', { flag: 'wx' }); await rm(probe);
      directory = await mkdtemp(join(tmpdir(), 'stream-jams-cold-timing-'));
      native = createNativeProbe(directory, executablePath, pid => child(join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F']));
      await native.prepare(signal);
    },
    async purge(signal, onEvent) {
      // Revalidate exact executable bytes immediately before each purge pair.
      if (await hash(tool.path) !== tool.sha256) throw new Error('RAMMap changed after preflight');
      if (await hash(traceHelper) !== helperSha256) throw new Error('ETW helper changed after preflight; purge blocked');
      for (const command of ['-Es', '-Et']) {
        const event = { command, requestedAt: new Date().toISOString(), status: 'requested' }; onEvent(event);
        try { await child(tool.path, [command], { signal }); event.status = 'exited-zero'; }
        catch (error) { event.status = 'failed-or-cancelled'; throw error; }
        finally { event.finishedAt = new Date().toISOString(); }
      }
    },
    async verifyTracing(signal) {
      if (await hash(traceHelper) !== helperSha256) throw new Error('ETW helper changed after preflight');
      trace = createTraceProbe(output, native.fixtures, child, signal);
      await trace.start(); await trace.control();
      const evidence = await trace.finish(); trace = undefined;
      return evidence;
    },
    async startTrace(signal) {
      if (await hash(traceHelper) !== helperSha256) throw new Error('ETW helper changed after preflight');
      trace = createTraceProbe(output, native.fixtures, child, signal);
      await trace.start(); await trace.control();
    },
    async finishTrace(rows) {
      const evidence = await trace.finish(rows); trace = undefined; return evidence;
    },
    async measure(pass, signal) { return { ...await native.measure(pass, signal), runtime: native.runtime }; },
    async cleanup() {
      let traceFailure, nativeFailure, exited;
      try { await trace?.stop(); } catch (error) { traceFailure = error; }
      try { exited = await native?.close(); } catch (error) { nativeFailure = error; }
      if (traceFailure || nativeFailure) {
        const failure = new Error([traceFailure?.message, nativeFailure?.message].filter(Boolean).join('; '));
        failure.cleanupEvidence = { ...exited, ...nativeFailure?.cleanupEvidence, ...(trace ? { traceOwnership: trace.ownership, traceCleanup: traceFailure ? 'failed' : 'completed' } : {}),
          nativeCleanup: nativeFailure ? 'failed' : 'completed', retainedFixtureDirectory: directory };
        throw failure;
      }
      if (trace) exited.traceOwnership = trace.ownership;
      if (directory) await removeFixtures(directory);
      return exited;
    },
    async retainLock(metadata) {
      const record = { status: 'retained', path: lockPath, ...metadata };
      try {
        const own = await lock.stat(), current = await stat(lockPath);
        if (own.dev !== current.dev || own.ino !== current.ino) throw new Error('Machine lock path ownership changed; replacement retained');
        await lock.truncate(0); await lock.write(JSON.stringify(record, null, 2), 0, 'utf8'); await lock.sync();
      } finally { await lock.close(); }
      return record;
    },
    async unlock() {
      try {
        const own = await lock.stat(), current = await stat(lockPath);
        if (own.dev !== current.dev || own.ino !== current.ino) throw new Error('Machine lock path ownership changed; replacement retained');
        await lock.close(); await rm(lockPath);
      } catch (error) { await lock.close(); throw error; }
    },
    async save(result) { await mkdir(output, { recursive: true }); await writeFile(join(output, `timing-${Date.now()}-${randomUUID()}.json`), JSON.stringify(result, null, 2), { flag: 'wx' }); }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const controller = new AbortController(); options.signal = controller.signal;
    const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    try {
      const result = await runColdTiming(options, createAdapter(options));
      console.info(JSON.stringify(result, null, 2));
      if (!['completed', 'dry-run'].includes(result.outcome)) process.exitCode = 1;
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
