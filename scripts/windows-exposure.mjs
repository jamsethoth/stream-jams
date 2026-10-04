import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { isIP } from 'node:net';

export function classifyAddress(address) {
  if (address === '0.0.0.0' || address === '::' || address === '*') return 'wildcard';
  const version = isIP(address);
  if (version === 0) return 'unknown';
  const zoneParts = address.split('%');
  if (zoneParts.length > 2 || (zoneParts.length === 2 && !/^[a-zA-Z0-9_.-]+$/.test(zoneParts[1]))) return 'unknown';
  const normalizedAddress = zoneParts[0];
  const canonical = version === 6 ? new URL(`http://[${normalizedAddress}]/`).hostname : address;
  if (canonical === '[::1]' || (version === 4 && address.startsWith('127.')) || /^\[::ffff:7f[0-9a-f]{2}:/.test(canonical)) return 'loopback';
  return 'specific-interface';
}
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
export function portMatches(filter, port) {
  return list(filter).some(value => String(value).split(',').some(part => {
    if (part.trim().toLowerCase() === 'any') return true;
    const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    return range !== null && port >= Number(range[1]) && port <= Number(range[2] ?? range[1]);
  }));
}
export function reportExposure(snapshot) {
  const processes = list(snapshot.processes);
  const endpoints = list(snapshot.endpoints).filter(endpoint => processes.some(proc => proc.processId === endpoint.processId)).map(endpoint => ({ ...endpoint, binding: classifyAddress(endpoint.address), remoteReachability: 'unproven' }));
  const rules = list(snapshot.rules).filter(rule => String(rule.enabled).toLowerCase() === 'true' &&
    (list(rule.profiles).some(profile => profile === 'Any' || list(snapshot.activeProfiles).includes(profile))) &&
    endpoints.some(endpoint => processes.some(proc => proc.processId === endpoint.processId && (String(rule.application).toLowerCase() === 'any' || String(rule.application).toLowerCase() === String(proc.executablePath).toLowerCase())) && (String(rule.protocol).toLowerCase() === 'any' || String(rule.protocol).toUpperCase() === endpoint.protocol || String(rule.protocol) === (endpoint.protocol === 'TCP' ? '6' : '17')) && portMatches(rule.localPort, endpoint.port)));
  return { assessment: processes.length === 0 || list(snapshot.errors).length > 0 || rules.some(rule => rule.filterCompleteness === 'partial') ? 'unknown' : 'observed', remoteReachability: 'unproven', processes, endpoints, potentiallyApplicableRules: rules, activeProfiles: list(snapshot.activeProfiles), firewallProfiles: list(snapshot.firewallProfiles), errors: list(snapshot.errors) };
}
export function parsePids(args) {
  if (args[0] === '--') args = args.slice(1);
  const pids = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--pid' || !/^[1-9]\d*$/.test(args[++i] ?? '')) throw new Error('Usage: windows-exposure [--pid <positive PID>] ...');
    pids.push(Number(args[i]));
  }
  return [...new Set(pids)];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'win32') throw new Error('Windows exposure inspection requires Windows.');
    const pids = parsePids(process.argv.slice(2));
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./windows-exposure.ps1', import.meta.url)), '-ExplicitPids', pids.join(',')], { windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(JSON.stringify(reportExposure(JSON.parse(stdout)), null, 2) + '\n');
  // error-provenance: allow expected -- OS collection failures expose only a bounded unknown assessment, never native command output
  } catch { process.stdout.write(JSON.stringify(reportExposure({ errors: ['Windows collection failed, timed out, or was unavailable'] }), null, 2) + '\n'); process.exitCode = 1; }
}
