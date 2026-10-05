/* global require, URL, Response, AbortController, fetch, Headers, ReadableStream */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron bootstrap for this isolated CommonJS probe uses the CommonJS electron entry point. */
const process = require('node:process');
const console = require('node:console');
const { setTimeout, clearTimeout } = require('node:timers');
const { app, BrowserWindow, protocol, session } = require('electron');
const { createServer } = require('node:http');
const { open, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const root = process.argv.find(arg => arg.startsWith('--probe-root=')).slice('--probe-root='.length);
app.setPath('userData', resolve(root, 'user-data'));
app.setPath('sessionData', resolve(root, 'session-data'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('window-all-closed', () => {});
protocol.registerSchemesAsPrivileged([{ scheme: 'stream-jams-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const results = { requests: [], checks: {}, cleanup: {}, versions: process.versions };
let server, window, active = 0, served = 0, closedEarly = 0, bodyCancelled = 0, signalAborted = 0;
const controllers = new Set();
const deadline = setTimeout(() => finish(new Error('Probe timed out')), 45000);
async function finish(error) {
  clearTimeout(deadline);
  for (const controller of controllers) controller.abort();
  if (window && !window.isDestroyed()) window.destroy();
  if (server) { server.closeAllConnections(); server.close(); }
  results.cleanup = { active, served, closedEarly, bodyCancelled, signalAborted };
  if (error) results.error = error.stack;
  await writeFile(resolve(root, app.isPackaged ? 'packaged-results.json' : 'development-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  app.exit(error ? 1 : 0);
}
app.whenReady().then(async () => {
  results.packaged = app.isPackaged;
  const inspection = await open(resolve(root, 'sine.wav'));
  const size = (await inspection.stat()).size; await inspection.close();
  // Test server intentionally throttles chunks so cancellation has unread bytes.
  server = createServer(async (request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/media' }); response.end(); return; }
    if (request.url !== '/media' || request.headers.authorization !== 'Bearer main-only-fixture-grant') { response.writeHead(403); response.end(); return; }
    let start = 0, end = size - 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
    if (range) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    if (start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
    response.writeHead(range ? 206 : 200, { 'Content-Type': 'audio/wav', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ETag: '"fixture-v1"', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    results.requests.push({ method: request.method, range: request.headers.range ?? null, start, end });
    if (request.method === 'HEAD') { response.end(); return; }
    const file = await open(resolve(root, 'sine.wav')); active++;
    const stream = file.createReadStream({ start, end, highWaterMark: 65536, autoClose: true });
    let complete = false;
    response.once('close', () => { if (!complete) closedEarly++; stream.destroy(); });
    try {
      for await (const chunk of stream) {
        if (response.destroyed) break;
        served += chunk.length;
        if (!response.write(chunk)) await new Promise(done => {
          const settled = () => { response.removeListener('drain', settled); response.removeListener('close', settled); done(); };
          response.once('drain', settled); response.once('close', settled);
        });
        await new Promise(done => setTimeout(done, 30));
      }
      complete = !response.destroyed; response.end();
    } catch (error) { if (!response.destroyed) response.destroy(error); }
    finally { active--; await file.close().catch(() => {}); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const trustedOrigin = `http://127.0.0.1:${server.address().port}`;
  const privateSession = session.fromPartition('desktop-protocol-probe', { cache: false });
  const csp = "default-src 'none'; script-src 'self'; media-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  privateSession.protocol.handle('stream-jams-audio', async request => {
    const url = new URL(request.url);
    if (url.host !== 'player' || url.search || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
    if (url.pathname === '/') return new Response('<!doctype html><title>Disposable protocol probe</title>', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': csp } });
    if (!['/media/opaque-fixture', '/media/redirect'].includes(url.pathname)) return new Response(null, { status: 404 });
    const controller = new AbortController(); controllers.add(controller);
    request.signal.addEventListener('abort', () => { signalAborted++; controller.abort(); }, { once: true });
    const headers = { Authorization: 'Bearer main-only-fixture-grant' };
    for (const name of ['range', 'if-range', 'if-none-match', 'if-match']) if (request.headers.has(name)) headers[name] = request.headers.get(name);
    try {
      const upstream = await fetch(`${trustedOrigin}${url.pathname.endsWith('redirect') ? '/redirect' : '/media'}`, { method: request.method, headers, signal: controller.signal, redirect: 'error' });
      const safeHeaders = new Headers();
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control']) if (upstream.headers.has(name)) safeHeaders.set(name, upstream.headers.get(name));
      if (!upstream.body) { controllers.delete(controller); return new Response(null, { status: upstream.status, headers: safeHeaders }); }
      const reader = upstream.body.getReader();
      const body = new ReadableStream({
        async pull(target) { try { const next = await reader.read(); if (next.done) { controllers.delete(controller); target.close(); } else target.enqueue(next.value); } catch (error) { controllers.delete(controller); target.error(error); } },
        async cancel(reason) { bodyCancelled++; controller.abort(); controllers.delete(controller); await reader.cancel(reason).catch(() => {}); }
      });
      return new Response(body, { status: upstream.status, headers: safeHeaders });
    } catch { controllers.delete(controller); return new Response(null, { status: 502 }); }
  });
  results.checks.sessionIsolation = !session.defaultSession.protocol.isProtocolHandled('stream-jams-audio');
  const ranged = await privateSession.fetch('stream-jams-audio://player/media/opaque-fixture', { headers: { Range: 'bytes=44-143' } });
  results.checks.range = { status: ranged.status, contentRange: ranged.headers.get('content-range'), bytes: (await ranged.arrayBuffer()).byteLength };
  const head = await privateSession.fetch('stream-jams-audio://player/media/opaque-fixture', { method: 'HEAD' });
  results.checks.head = { status: head.status, length: head.headers.get('content-length'), bytes: (await head.arrayBuffer()).byteLength };
  for (const [name, url, init] of [['wrongHost', 'stream-jams-audio://other/media/opaque-fixture'], ['unknownHandle', 'stream-jams-audio://player/media/unknown'], ['post', 'stream-jams-audio://player/media/opaque-fixture', { method: 'POST' }], ['redirect', 'stream-jams-audio://player/media/redirect']]) results.checks[name] = (await privateSession.fetch(url, init)).status;
  const cancelled = await privateSession.fetch('stream-jams-audio://player/media/opaque-fixture');
  const cancelledReader = cancelled.body.getReader(); await cancelledReader.read(); await cancelledReader.cancel();
  await new Promise(done => setTimeout(done, 250));
  results.checks.fetchCancel = { active, bodyCancelled, signalAborted, closedEarly };
  window = new BrowserWindow({ show: false, webPreferences: { session: privateSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await window.loadURL('stream-jams-audio://player/');
  results.checks.renderer = await window.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    const audio = new Audio('/media/opaque-fixture'); document.body.append(audio);
    const context = new AudioContext({ sinkId: { type: 'none' } });
    const source = context.createMediaElementSource(audio), gain = context.createGain(), analyser = context.createAnalyser();
    source.connect(gain); gain.connect(analyser); analyser.connect(context.destination); await context.resume();
    await audio.play(); await sleep(350);
    const rms = () => { const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values); return Math.sqrt(values.reduce((total, v) => total + v*v, 0) / values.length); };
    const one = rms(); gain.gain.value = 2; await sleep(250); const two = rms();
    audio.currentTime = 50; await new Promise((done, reject) => { audio.addEventListener('seeked', done, { once: true }); setTimeout(() => reject(new Error('seek timed out')), 5000); });
    const seekTime = audio.currentTime, duration = audio.duration;
    let blocked = false; try { await fetch('http://127.0.0.1:1/'); } catch { blocked = true; }
    audio.pause(); audio.removeAttribute('src'); audio.load(); audio.remove(); await context.close();
    return { origin: location.origin, secure: isSecureContext, duration, seekTime, rmsGain1: one, rmsGain2: two, ratio: two / one, connectBlocked: blocked, silentSink: context.sinkId };
  })()`);
  await new Promise(done => setTimeout(done, 400));
  results.checks.mediaDetach = { active, controllers: controllers.size, bodyCancelled, signalAborted, closedEarly };
  // Cancellation cannot rely on request.signal alone. Authoritative registry
  // revocation/worker teardown must abort every outstanding upstream fetch.
  for (const controller of controllers) controller.abort();
  controllers.clear();
  await new Promise(done => setTimeout(done, 400));
  results.checks.hostRevoke = { active, controllers: controllers.size, bodyCancelled, signalAborted, closedEarly };
  if (!results.checks.sessionIsolation || results.checks.range.status !== 206 || results.checks.range.bytes !== 100 || results.checks.head.bytes !== 0 || results.checks.wrongHost !== 404 || results.checks.unknownHandle !== 404 || results.checks.post !== 404 || results.checks.redirect !== 502 || !results.checks.renderer.connectBlocked || results.checks.renderer.origin !== 'stream-jams-audio://player' || !results.checks.renderer.secure || results.checks.renderer.rmsGain1 <= 0.02 || results.checks.renderer.ratio < 1.8 || results.checks.renderer.seekTime < 50 || !results.requests.some(request => request.start > size / 2) || active !== 0 || controllers.size !== 0) throw new Error('One or more acceptance checks failed; inspect results');
  await finish();
}).catch(finish);
