import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const runnerRequire = createRequire(webRequire.resolve('@storybook/test-runner/package.json'));
const nycRequire = createRequire(runnerRequire.resolve('@istanbuljs/load-nyc-config/package.json'));
const { loadNycConfig } = runnerRequire('@istanbuljs/load-nyc-config');

test('Storybook NYC consumer retains YAML load, inheritance and rejected invalid configurations', async () => {
  assert.equal(nycRequire('js-yaml/package.json').version, '4.3.2');
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-nyc-yaml-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'disposable-nyc', nyc: { all: true } }));
    await writeFile(join(directory, 'base.yml'), 'include:\n  - src/**/*.ts\ncheck-coverage: true\n');
    await writeFile(join(directory, '.nycrc.yaml'), 'extends: ./base.yml\nexclude: tests/**\nreporter:\n  - text\n');
    const config = await loadNycConfig({ cwd: directory });
    assert.equal(config.all, true);
    assert.equal(config.checkCoverage, true);
    assert.deepEqual(config.include, ['src/**/*.ts']);
    assert.deepEqual(config.exclude, ['tests/**']);
    assert.deepEqual(config.reporter, ['text']);
    await writeFile(join(directory, '.nycrc.yaml'), 'include: [unterminated\n');
    await assert.rejects(loadNycConfig({ cwd: directory }), /unexpected end|flow collection/iu);
    await writeFile(join(directory, '.nycrc.yaml'), 'extends: ./.nycrc.yaml\n');
    await assert.rejects(loadNycConfig({ cwd: directory }), /Circular extended configurations/u);
    await writeFile(join(directory, '.nycrc.yaml'), 'extends: 42\n');
    await assert.rejects(loadNycConfig({ cwd: directory }), /invalid.*extends/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
