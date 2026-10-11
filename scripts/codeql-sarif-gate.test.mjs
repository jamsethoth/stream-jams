import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateSarif, formatFinding, gateDirectory } from './codeql-sarif-gate.mjs';

const rule = (id, level, severity) => ({ id, defaultConfiguration: { level }, properties: severity === undefined ? {} : { 'security-severity': severity } });
const result = (ruleId, index, extra = {}) => ({ ruleId, rule: { id: ruleId, index, toolComponent: { index: 0 } }, message: { text: `${ruleId} found` }, locations: [{ physicalLocation: { artifactLocation: { uri: 'apps/server/src/a.ts' }, region: { startLine: 4 } } }], ...extra });
const report = (rules, results) => ({ runs: [{ tool: { driver: { name: 'CodeQL', rules: [] }, extensions: [{ name: 'codeql/javascript-queries', rules }] }, results }] });

test('a clean report has no findings', () => {
  assert.deepEqual(evaluateSarif(report([], [])), { findings: [], blocking: [], staleExceptions: [] });
});

test('high and critical security severity and error level block; lower findings are reported only', () => {
  const rules = [rule('js/xss', 'error', '6.1'), rule('js/sql-injection', 'warning', '8.8'), rule('js/unused-local', 'note'), rule('js/weak-random', 'warning', '5.0'), rule('js/critical', 'warning', '9.8')];
  const summary = evaluateSarif(report(rules, [result('js/xss', 0), result('js/sql-injection', 1), result('js/unused-local', 2), result('js/weak-random', 3), result('js/critical', 4)]));
  assert.deepEqual(summary.blocking.map(finding => finding.ruleId), ['js/xss', 'js/sql-injection', 'js/critical']);
  assert.equal(summary.findings.length, 5);
  assert.equal(formatFinding(summary.findings[1]), 'apps/server/src/a.ts:4 js/sql-injection (warning, security 8.8): js/sql-injection found');
});

test('a result level overrides the rule default and rules resolve by id without an index', () => {
  const summary = evaluateSarif(report([rule('js/a', 'note')], [{ ruleId: 'js/a', level: 'error', message: { text: 'm' } }]));
  assert.equal(summary.blocking.length, 1);
  assert.equal(formatFinding(summary.findings[0]), 'unknown js/a (error): m');
});

test('in-source suppressions are listed without blocking unless rejected', () => {
  const rules = [rule('js/a', 'error'), rule('js/b', 'error'), rule('js/c', 'error')];
  const summary = evaluateSarif(report(rules, [
    result('js/a', 0, { suppressions: [{ kind: 'inSource' }] }),
    result('js/b', 1, { suppressions: [{ kind: 'inSource', status: 'rejected' }] }),
    result('js/c', 2, { suppressions: [] })
  ]));
  assert.deepEqual(summary.blocking.map(finding => finding.ruleId), ['js/b', 'js/c']);
  assert.match(formatFinding(summary.findings[0]), /^SUPPRESSED /);
});

test('reviewed exceptions match by rule and file, and unmatched exceptions are reported stale', () => {
  const rules = [rule('js/a', 'error'), rule('js/b', 'error')];
  const matched = { rule: 'js/a', file: 'apps/server/src/a.ts', reason: 'reviewed' };
  const otherFile = { rule: 'js/b', file: 'apps/server/src/b.ts', reason: 'reviewed' };
  const summary = evaluateSarif(report(rules, [result('js/a', 0), result('js/b', 1)]), [matched, otherFile]);
  assert.deepEqual(summary.blocking.map(finding => finding.ruleId), ['js/b']);
  assert.match(formatFinding(summary.findings[0]), /^SUPPRESSED /);
  assert.deepEqual(summary.staleExceptions, [otherFile]);
  for (const invalid of [{ rule: 'js/a', file: 'a.ts' }, { rule: '', file: 'a.ts', reason: 'r' }, 'js/a']) assert.throws(() => evaluateSarif(report(rules, []), [invalid]), /must each name/);
});

test('missing or malformed reports fail closed', () => {
  for (const value of [null, {}, { runs: [] }, { runs: [{ tool: {}, results: [] }] }, { runs: [{ tool: { driver: { rules: [] } } }] }]) assert.throws(() => evaluateSarif(value));
  assert.throws(() => evaluateSarif(report([], [{ message: { text: 'no rule' } }])), /rule identifier/);
  assert.throws(() => evaluateSarif(report([rule('js/a', 'warning', 'high')], [result('js/a', 0)])), /invalid security severity/);
});

test('stale exceptions block full scans but not diff-informed pull-request scans', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'javascript.sarif'), JSON.stringify(report([rule('js/a', 'error')], [result('js/a', 0)])));
  const matched = { rule: 'js/a', file: 'apps/server/src/a.ts', reason: 'reviewed' };
  const absent = { rule: 'js/b', file: 'apps/server/src/b.ts', reason: 'reviewed' };
  const full = gateDirectory(directory, [matched, absent]);
  assert.equal(full.blocking, 1);
  assert.ok(full.lines.includes('STALE EXCEPTION apps/server/src/b.ts js/b: no longer reported; remove it.'));
  const partial = gateDirectory(directory, [matched, absent], { partialScan: true });
  assert.equal(partial.blocking, 0);
  assert.ok(partial.lines.includes('Exception not reported by this partial scan: apps/server/src/b.ts js/b.'));
  fs.writeFileSync(path.join(directory, 'javascript.sarif'), JSON.stringify(report([rule('js/b', 'error')], [result('js/b', 0)])));
  assert.equal(gateDirectory(directory, [], { partialScan: true }).blocking, 1);
});
