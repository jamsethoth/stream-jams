import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const blockingSeverities = ['moderate', 'high', 'critical'];
// Only advisories with no same-major fix, reached solely through dev build/test tooling. Each expires; any production finding still fails.
export const auditExceptions = [
  { ghsa: 'GHSA-g3hv-75wg-m249', expires: '2026-12-31', reason: 'minimatch 3/5/9/10 in electron-builder, Jest and ejs tooling; fixed only in minimatch 11' },
  { ghsa: 'GHSA-3g3m-2fjr-6pw4', expires: '2026-12-31', reason: 'glob 10/13 in Jest and electron tooling; fixed only in glob 14' }
];
export function evaluateAudit(report, { exceptions = auditExceptions, now = new Date() } = {}) {
  if (!report || report.error || !report.advisories || typeof report.advisories !== 'object' || Array.isArray(report.advisories)) throw new Error('Audit report is missing or has an unknown schema.');
  const counts = report.metadata?.vulnerabilities;
  if (!counts || severities.some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) throw new Error('Audit severity metadata is invalid.');
  const entries = Object.values(report.advisories);
  if (entries.some(entry => !entry || !severities.includes(entry.severity) || typeof entry.module_name !== 'string' || !entry.module_name || !Array.isArray(entry.findings) || entry.findings.length === 0 || entry.findings.some(finding => typeof finding.version !== 'string' || typeof finding.dev !== 'boolean' || !Array.isArray(finding.paths) || finding.paths.length === 0 || finding.paths.some(path => typeof path !== 'string' || !path)))) throw new Error('Audit advisory schema is invalid.');
  if (blockingSeverities.some(severity => entries.filter(entry => entry.severity === severity).length !== counts[severity])) throw new Error('Audit severity metadata does not match advisory entries.');
  const excepted = entries.filter(entry => entry.findings.every(finding => finding.dev) && exceptions.some(exception =>
    exception.ghsa === entry.github_advisory_id && now < new Date(`${exception.expires}T00:00:00Z`)));
  if (entries.some(entry => blockingSeverities.includes(entry.severity) && !excepted.includes(entry))) throw new Error('Moderate, high or critical dependency advisories remain.');
  return { moderate: counts.moderate, high: counts.high, critical: counts.critical, excepted: excepted.map(entry => entry.github_advisory_id) };
}
export function parseAuditExecution(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error('Dependency audit CLI failed; inspect the retained raw report.');
  const report = JSON.parse(result.stdout);
  if (report.error || !report.metadata?.vulnerabilities) throw new Error('Dependency audit registry or report failed.');
  const { moderate, high, critical } = report.metadata.vulnerabilities;
  if (result.status === 1 && moderate === 0 && high === 0 && critical === 0) throw new Error('Dependency audit CLI failed without moderate/high/critical advisory evidence.');
  if (result.status === 0 && (moderate > 0 || high > 0 || critical > 0)) throw new Error('Dependency audit CLI status contradicts moderate/high/critical advisory evidence.');
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const output = args.length === 0 ? 'pnpm-audit.json' : args.length === 2 && args[0] === '--output' ? args[1] : undefined;
    if (!output) throw new Error('Usage: dependency-audit [--output <report.json>]');
    const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'corepack', process.platform === 'win32' ? ['/d', '/s', '/c', 'corepack.cmd pnpm audit --audit-level moderate --json'] : ['pnpm', 'audit', '--audit-level', 'moderate', '--json'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(output, result.stdout ?? '');
    const report = parseAuditExecution(result);
    const summary = evaluateAudit(report);
    console.log(`Raw audit: ${summary.moderate} moderate, ${summary.high} high, ${summary.critical} critical. ${summary.excepted.length === 0 ? 'No exceptions' : `Dev-only exceptions: ${summary.excepted.join(', ')}`}. Raw report: ${output}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
