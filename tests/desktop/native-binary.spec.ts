import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

test("packaged Electron supports native SQLite and its bundled keyring", async () => {
  const root = resolve("apps/desktop/out/Stream Jams-win32-x64");
  const code = `
    const {createRequire} = require('node:module');
    const {DatabaseSync} = require('node:sqlite');
    const req = createRequire(process.argv[1]);
    const nativeReq = createRequire(req.resolve('@stream-jams/server/runtime'));
    console.log('loading keyring');
    const {Entry} = nativeReq('@napi-rs/keyring');
    console.log('constructing entry');
    const entry = new Entry('stream-jams-desktop-smoke', process.argv[2]);
    const database = new DatabaseSync(':memory:');
    try {
      console.log('writing temporary credential');
      entry.setPassword('temporary-desktop-verification');
      if (entry.getPassword() !== 'temporary-desktop-verification') throw new Error('Native credential roundtrip failed');
      database.exec('CREATE TABLE smoke (value INTEGER); INSERT INTO smoke VALUES (1)');
      if (database.prepare('SELECT value FROM smoke').get().value !== 1) throw new Error('Native SQLite failed');
      console.log('native checks passed');
    } finally { database.close(); entry.deletePassword(); }
    process.exit(0);
  `;
  const result = await promisify(execFile)(resolve(root, "Stream Jams.exe"), ["-e", code, resolve(root, "resources/app.asar/package.json"), randomUUID()], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 20_000
  });
  expect(result.stdout).toContain("native checks passed");
});

test("packaged server composition starts and closes under Electron's Node runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-native-runtime-"));
  const packageRoot = resolve("apps/desktop/out/Stream Jams-win32-x64");
  const code = `
    (async () => {
      const {createRequire} = require('node:module');
      const {pathToFileURL} = require('node:url');
      const {join,dirname} = require('node:path');
      const {createServer} = require('node:net');
      const req = createRequire(process.argv[1]);
      const root = process.argv[2];
      const server = createServer();
      await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
      const port = server.address().port;
      await new Promise(resolve => server.close(resolve));
      const config = {
        desktop:{closeToTray:true}, server:{host:'127.0.0.1',port},
        storage:{dataDirectory:join(root,'data'),assetDirectory:join(root,'assets')},
        logging:{level:'INFO',rollover:'hourly',retentionHours:48},
        playback:{paused:false,muted:false,doNotDisturb:false}
      };
      const {startLocalRuntime} = await import(pathToFileURL(req.resolve('@stream-jams/server/runtime')).href);
      console.log('starting packaged composition');
      const runtime = await startLocalRuntime({
        homeDirectory:root, environment:{}, webBuildDirectory:join(dirname(process.argv[1]),'web'),
        configStore:{readConfig:async()=>config,updateConfig:async()=>{throw new Error('No config mutation in startup check')}}
      });
      try {
        if ((await fetch(runtime.url+'/health')).status !== 200) throw new Error('Health failed');
      } finally { await runtime.close(); }
      console.log('packaged composition passed');
    })().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)});
  `;
  try {
    const result = await promisify(execFile)(resolve(packageRoot, "Stream Jams.exe"), ["-e", code, resolve(packageRoot, "resources/app.asar/package.json"), root], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 20_000
    });
    expect(result.stdout).toContain("packaged composition passed");
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

test("packaged keyring persists across independent processes and cleans up from the parent", async () => {
  const root = resolve("apps/desktop/out/Stream Jams-win32-x64");
  const service = `stream-jams-public-security-fixture-${randomUUID()}`;
  const account = randomUUID();
  const code = `
    const {createRequire} = require('node:module');
    const req = createRequire(process.argv[1]);
    const nativeReq = createRequire(req.resolve('@stream-jams/server/runtime'));
    const {Entry} = nativeReq('@napi-rs/keyring');
    const entry = new Entry(process.argv[2],process.argv[3]);
    const operation = process.argv[4];
    if (operation === 'write') entry.setPassword('deliberately-public-fixture');
    else if (operation === 'read') {
      if (entry.getPassword() !== 'deliberately-public-fixture') throw new Error('Cross-process persistence failed');
    } else if (operation === 'absent') {
      if (entry.getPassword() !== null) throw new Error('Parent cleanup left a credential');
    } else entry.deletePassword();
    console.log('keyring:'+operation+':passed');
  `;
  const child = (operation: string) => promisify(execFile)(resolve(root, "Stream Jams.exe"), ["-e", code, resolve(root, "resources/app.asar/package.json"), service, account, operation], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 20_000
  });
  try {
    expect((await child("write")).stdout).toContain("keyring:write:passed");
    expect((await child("read")).stdout).toContain("keyring:read:passed");
  } finally {
    // Parent owns cleanup even if the independent reader exits unsuccessfully.
    expect((await child("delete")).stdout).toContain("keyring:delete:passed");
    expect((await child("absent")).stdout).toContain("keyring:absent:passed");
  }
});
