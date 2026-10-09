import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Code scanning is unavailable for this private repository, so CodeQL results are gated here
// with GitHub's default pull-request thresholds: security severity high or above, or level error.
// Results carrying an accepted SARIF suppression, or matching a reviewed exception in
// .github/codeql-exceptions.json by rule and file, are listed but do not block. The CodeQL CLI
// does not turn in-source `codeql[rule-id]` comments into SARIF suppressions, so the exception
// file is the record; an exception that no longer matches a result fails the gate so it is removed.
export const blockingSecuritySeverity = 7;

export function evaluateSarif(report, exceptions = []) {
  if (!Array.isArray(exceptions) || !exceptions.every(isException)) throw new Error('CodeQL exceptions must each name a rule, a file and a reason.');
  const used = new Set();
  if (!report || typeof report !== 'object' || !Array.isArray(report.runs) || report.runs.length === 0) throw new Error('SARIF report is missing or has no runs.');
  const findings = [];
  for (const run of report.runs) {
    const components = [run?.tool?.driver, ...(Array.isArray(run?.tool?.extensions) ? run.tool.extensions : [])];
    if (!components[0] || !Array.isArray(run.results)) throw new Error('SARIF run is missing its tool driver or results.');
    for (const result of run.results) {
      const rule = ruleFor(result, components);
      const ruleId = result?.ruleId ?? result?.rule?.id ?? rule?.id;
      if (typeof ruleId !== 'string' || !ruleId) throw new Error('SARIF result has no rule identifier.');
      const level = result.level ?? rule?.defaultConfiguration?.level ?? 'warning';
      const rawSeverity = rule?.properties?.['security-severity'];
      const securitySeverity = rawSeverity === undefined ? null : Number(rawSeverity);
      if (securitySeverity !== null && !Number.isFinite(securitySeverity)) throw new Error(`Rule ${ruleId} has an invalid security severity.`);
      const location = result.locations?.[0]?.physicalLocation;
      // An in-source `codeql[rule-id]` comment records a reviewed exception at the flagged line.
      const file = location?.artifactLocation?.uri ?? 'unknown';
      const exception = exceptions.findIndex(entry => entry.rule === ruleId && entry.file === file);
      if (exception !== -1) used.add(exception);
      const suppressed = exception !== -1 || (Array.isArray(result.suppressions) && result.suppressions.length > 0 && result.suppressions.every(entry => entry?.status === undefined || entry.status === 'accepted'));
      findings.push({
        ruleId,
        level,
        securitySeverity,
        file,
        line: location?.region?.startLine ?? null,
        message: result.message?.text ?? '',
        suppressed,
        blocking: !suppressed && (level === 'error' || (securitySeverity !== null && securitySeverity >= blockingSecuritySeverity))
      });
    }
  }
  return { findings, blocking: findings.filter(finding => finding.blocking), staleExceptions: exceptions.filter((_, index) => !used.has(index)) };
}

function isException(entry) {
  return ['rule', 'file', 'reason'].every(key => typeof entry?.[key] === 'string' && entry[key].trim() !== '');
}

function ruleFor(result, components) {
  const reference = result?.rule;
  if (reference && Number.isSafeInteger(reference.index)) {
    const component = components[Number.isSafeInteger(reference.toolComponent?.index) ? reference.toolComponent.index + 1 : 0];
    const rule = component?.rules?.[reference.index];
    if (rule) return rule;
  }
  if (Number.isSafeInteger(result?.ruleIndex)) return components[0]?.rules?.[result.ruleIndex];
  const id = result?.ruleId ?? reference?.id;
  return components.flatMap(component => component?.rules ?? []).find(rule => rule?.id === id);
}

export function formatFinding(finding) {
  const severity = finding.securitySeverity === null ? finding.level : `${finding.level}, security ${finding.securitySeverity}`;
  return `${finding.suppressed ? 'SUPPRESSED ' : ''}${finding.file}${finding.line === null ? '' : `:${finding.line}`} ${finding.ruleId} (${severity}): ${finding.message}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [directory, exceptionsPath] = process.argv.slice(2);
    if (!directory || process.argv.length > 4) throw new Error('Usage: codeql-sarif-gate <sarif-directory> [exceptions.json]');
    const exceptions = exceptionsPath ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')) : [];
    const files = fs.readdirSync(directory).filter(name => name.endsWith('.sarif'));
    if (files.length === 0) throw new Error(`No SARIF files were written to ${directory}.`);
    let blocking = 0;
    const unused = new Set(exceptions);
    for (const file of files) {
      const summary = evaluateSarif(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')), exceptions);
      for (const entry of exceptions) if (!summary.staleExceptions.includes(entry)) unused.delete(entry);
      console.log(`${file}: ${summary.findings.length} findings, ${summary.blocking.length} blocking.`);
      for (const finding of summary.findings) console.log(`${finding.blocking ? 'BLOCKING ' : ''}${formatFinding(finding)}`);
      blocking += summary.blocking.length;
    }
    for (const entry of unused) console.log(`STALE EXCEPTION ${entry.file} ${entry.rule}: no longer reported; remove it.`);
    if (unused.size > 0) blocking += unused.size;
    if (blocking > 0) throw new Error(`${blocking} CodeQL findings are errors or high-severity security issues, or exceptions are stale.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
