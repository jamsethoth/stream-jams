import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

test('structural inspector never turns known, unknown or malformed XML into eviction', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-residency-inspect-'));
  const script = fileURLToPath(new URL('./local-media-residency-inspect.ps1', import.meta.url));
  const cases = [
    ['<root Application="RamMap" Version="1.0" Architecture="amd64"><FileList><File Key="42" Path="PRIVATE_PATH"/></FileList><PfnDatabase>00112233</PfnDatabase></root>', 0, true],
    ['<root Application="Unknown" Version="999" Architecture="arm64"/>', 0, false],
    ['<root><FileList><File residentBytes="0"/></FileList></root>', 0, false],
    ['<root><FileList>', 1],
    ['<!DOCTYPE root [<!ENTITY secret SYSTEM "file:///PRIVATE_PATH">]><root>&secret;</root>', 1]
  ];
  try {
    for (const [xml, exitCode, recognized] of cases) {
      const snapshot = join(directory, 'probe.rmp');
      await writeFile(snapshot, xml);
      const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, '-Snapshot', snapshot], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      assert.ifError(result.error);
      assert.equal(result.status, exitCode, result.stderr);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.status, 'inconclusive');
      assert.equal('residentBytes' in evidence, false);
      assert.equal(result.stdout.includes('PRIVATE_PATH'), false);
      if (recognized !== undefined) assert.equal(evidence.recognizedRoot, recognized);
      if (recognized) {
        assert.equal(evidence.fileEntries, 1);
        assert.equal(evidence.selfClosingFileEntries, 1);
        assert.deepEqual(evidence.fileAttributeNames, ['Key', 'Path']);
        assert.equal(evidence.pfnDatabaseTextCharacters, 8);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
