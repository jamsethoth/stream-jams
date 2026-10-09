import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSarif, formatFinding } from './codeql-sarif-gate.mjs';

const rule = (id, level, severity) => ({ id, defaultConfiguration: { level }, properties: severity === undefined ? {} : { 'security-severity': severity } });
const result = (ruleId, index, extra = {}) => ({ ruleId, rule: { id: ruleId, index, toolComponent: { index: 0 } }, message: { text: `${ruleId} found` }, locations: [{ physicalLocation: { artifactLocation: { uri: 'apps/server/src/a.ts' }, region: { startLine: 4 } } }], ...extra });
const report = (rules, results) => ({ runs: [{ tool: { driver: { name: 'CodeQL', rules: [] }, extensions: [{ name: 'codeql/javascript-queries', rules }] }, results }] });

test('a clean report has no findings', () => {
  assert.deepEqual(evaluateSarif(report([], [])), { findings: [], blocking: [] });
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

test('missing or malformed reports fail closed', () => {
  for (const value of [null, {}, { runs: [] }, { runs: [{ tool: {}, results: [] }] }, { runs: [{ tool: { driver: { rules: [] } } }] }]) assert.throws(() => evaluateSarif(value));
  assert.throws(() => evaluateSarif(report([], [{ message: { text: 'no rule' } }])), /rule identifier/);
  assert.throws(() => evaluateSarif(report([rule('js/a', 'warning', 'high')], [result('js/a', 0)])), /invalid security severity/);
});
