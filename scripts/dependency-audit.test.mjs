import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudit, parseAuditExecution } from './dependency-audit.mjs';
const clean = () => ({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } }, advisories: {} });
const finding = severity => { const report = clean(); report.metadata.vulnerabilities[severity] = 1; report.advisories.one = { module_name: 'dependency', severity, findings: [{ version: '1.0.0', dev: true, paths: ['workspace>dependency'] }] }; return report; };
test('clean report passes with zero moderate, high and critical findings', () => { assert.deepEqual(evaluateAudit(clean()), { moderate: 0, high: 0, critical: 0 }); assert.deepEqual(parseAuditExecution({ status: 0, stdout: JSON.stringify(clean()) }), clean()); });
for (const severity of ['moderate', 'high', 'critical']) test(`${severity} finding fails without any exception`, () => { assert.throws(() => evaluateAudit(finding(severity)), /advisories remain/); assert.deepEqual(parseAuditExecution({ status: 1, stdout: JSON.stringify(finding(severity)) }), finding(severity)); assert.throws(() => parseAuditExecution({ status: 0, stdout: JSON.stringify(finding(severity)) }), /contradicts/); });
test('missing, malformed or inconsistent schemas and counts fail', () => {
  for (const report of [null, {}, { error: 'registry' }, { ...clean(), advisories: [] }, { ...clean(), metadata: { vulnerabilities: { moderate: 0, high: 0, critical: 0 } } }]) assert.throws(() => evaluateAudit(report));
  for (const severity of ['moderate', 'high', 'critical']) { const report = finding(severity); report.metadata.vulnerabilities[severity] = 0; assert.throws(() => evaluateAudit(report), /does not match/); const missing = clean(); missing.metadata.vulnerabilities[severity] = 1; assert.throws(() => evaluateAudit(missing), /does not match/); }
  for (const mutate of [r => r.metadata.vulnerabilities.high = -1, r => r.metadata.vulnerabilities.high = '0', r => r.advisories.one.severity = 'unknown', r => r.advisories.one.findings = [], r => r.advisories.one.findings[0].paths = [], r => r.advisories.one.findings[0].dev = 'true']) { const report = finding('high'); mutate(report); assert.throws(() => evaluateAudit(report)); }
});
test('CLI and registry failures, malformed JSON and contradictory exit status fail closed', () => {
  for (const result of [{ status: 2, stdout: '{}' }, { status: null, error: new Error('spawn'), stdout: '{}' }, { status: 1, signal: 'SIGTERM', stdout: '{}' }, { status: 1, stdout: '{' }, { status: 1, stdout: JSON.stringify({ error: { code: 'ECONNREFUSED' } }) }, { status: 1, stdout: JSON.stringify(clean()) }]) assert.throws(() => parseAuditExecution(result));
});
