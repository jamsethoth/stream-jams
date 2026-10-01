import { app, screen } from 'electron';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.STREAM_JAMS_ACCEPTANCE_ROOT;
const runtime = process.env.STREAM_JAMS_ACCEPTANCE_RUNTIME;
app.setPath('userData', resolve(root, 'user-data')); app.setPath('sessionData', resolve(root, 'session-data'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); app.on('window-all-closed', () => {});
const { AudioWindow, registerAudioPlayerScheme } = await import(pathToFileURL(resolve(runtime, 'dist/audio/audio-window.js')));
const { AudioHost } = await import(pathToFileURL(resolve(runtime, 'dist/audio/audio-host.js')));
const { overlayPlayerScheme } = await import(pathToFileURL(resolve(runtime, 'dist/overlay/overlay-player-policy.js')));
const { OverlayHost } = await import(pathToFileURL(resolve(runtime, 'dist/overlay/overlay-host.js')));
const { PrivateOverlayWindow } = await import(pathToFileURL(resolve(runtime, 'dist/overlay/private-overlay-window.js')));
registerAudioPlayerScheme([overlayPlayerScheme]);
const results = { packaged: app.isPackaged, versions: process.versions, files: [], requests: [], ipc: [], diagnostics: [] };
let server, host, overlay, visualPort, port, active = 0, served = 0;
const deadline = setTimeout(() => finish(new Error('Acceptance timed out after 60 seconds')), 60000);
async function finish(error) {
 clearTimeout(deadline); await host?.close(); await overlay?.close(); server?.closeAllConnections(); server?.close();
 results.cleanup = { activeReaders: active, servedBytes: served, rendererDestroyed: port?.window.isDestroyed() ?? true, overlayDestroyed: visualPort?.native.window.isDestroyed() ?? true };
 if (error) results.error = error.stack;
 await writeFile(resolve(root, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2)); app.exit(error ? 1 : 0);
}
app.whenReady().then(async () => {
 const files = new Map();
 const png = resolve(root, 'transparent.png'); await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
 for (const [id, path, mimeType] of [
  ['tone', resolve(runtime, 'dist/audio/tone.wav'), 'audio/wav'],
  ['transparent-image', png, 'image/png'],
  ['clean-screen', 'F:/Streaming/Assets/Screen Effects/Screen Blocked/clean screen.webm', 'video/webm'],
  ['snowball', 'F:/Streaming/Assets/Screen Effects/Screen Blocked/snowball.webm', 'video/webm']
 ]) {
  const sizeBytes = (await stat(path)).size; const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  files.set(`med_${createHash('sha256').update(id).digest('base64url')}`, { id, path, snapshot: { assetId: id, sizeBytes, mimeType, version: hash.digest('hex'), durationMs: null } });
 }
 server = createServer((request, response) => {
  const file = files.get(request.url?.slice('/media/'.length));
  if (!file || !request.url.startsWith('/media/') || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
  let start = 0, end = file.snapshot.sizeBytes - 1; const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
  if (range) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
  if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${file.snapshot.sizeBytes}` }); response.end(); return; }
  response.writeHead(range ? 206 : 200, { 'Content-Type': file.snapshot.mimeType, 'Content-Length': end-start+1, 'Accept-Ranges': 'bytes', ETag: `"${file.snapshot.version}"`, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.snapshot.sizeBytes}` } : {}) });
  results.requests.push({ assetId: file.id, method: request.method, range: request.headers.range ?? null });
  if (request.method === 'HEAD') { response.end(); return; }
  active++; const stream = createReadStream(file.path, { start, end, highWaterMark: 65536 }); let closed = false;
  const release = () => { if (!closed) { closed = true; active--; } };
  stream.on('data', chunk => { served += chunk.length; }); stream.once('close', release); response.once('close', () => stream.destroy()); void (async () => {
   try { for await (const chunk of stream) { if (!response.write(chunk)) await new Promise(accept => response.once('drain', accept)); await new Promise(accept => setTimeout(accept, 5)); } response.end(); }
   catch { response.destroy(); }
  })();
 });
 await new Promise(accept => server.listen(0, '127.0.0.1', accept)); const origin = `http://127.0.0.1:${server.address().port}`;
 host = new AudioHost((callbacks, generation) => {
  port = new AudioWindow(callbacks, { trustedServiceOrigin: origin, generation });
  const send = port.send.bind(port); port.send = request => {
   const serialized = JSON.stringify(request); if (serialized.includes('med_') || serialized.includes('bytes') || serialized.includes('file:')) throw new Error('Trusted media leaked across renderer IPC');
   results.ipc.push({ command: request.command.type, bytes: Buffer.byteLength(serialized) }); send(request);
  }; return port;
 }, input => results.diagnostics.push({ source: input.source, message: input.message }));
 host.beginOwnership(); const lease = setInterval(() => host.refreshLease(), 1000);
 const devices = await host.listOutputDevices(); results.explicitDeviceCount = devices.length;
 if (!devices[0]) throw new Error('No explicit output exists in the isolated runtime; native route acceptance blocked');
 await host.testOutput(devices[0].deviceId); results.fixedTonePassed = true;
 for (const [handle, file] of files) {
  if (file.snapshot.mimeType.startsWith("image/")) continue;
  const payload = { batch: { playbackId: file.id, documentId: 'isolated-acceptance', durationMs: 1000, muted: true,
   layers: [{ sourceKind: file.snapshot.mimeType.startsWith('video/') ? 'video-soundtrack' : 'audio', layerId: file.id, assetId: file.id, volume: file.id === "snowball" ? 2 : 1, playbackDurationMs: 1000 }],
   destinations: [{ deviceId: devices[0].deviceId, routeIds: ['isolated-muted-route'] }] }, assets: [{ assetId: file.id, grant: { handle, snapshot: file.snapshot, expiresAt: Date.now() + 60000 } }], startDeadlineMs: Date.now()+5000, deadlineMs: Date.now()+15000 };
  const preparedAt = Date.now(); const prepared = await host.prepare(payload); const readyAt = Date.now();
  const result = await prepared.start(Date.now()+100);
  const report = { assetId: file.id, sizeBytes: file.snapshot.sizeBytes, preparationMs: readyAt-preparedAt, ...result }; results.files.push(report);
  if (result.failedRouteIds.length) throw new Error(`${file.id} native playback failed: ${JSON.stringify(result.failures)}`);
  if (!result.diagnostics?.actualStartEpochMs) throw new Error(`${file.id} did not report actual onset`);
  if (file.id !== 'tone' && file.snapshot.sizeBytes <= 25*1024*1024) throw new Error('Large original fixture is too small');
 }
 const display = screen.getPrimaryDisplay();
 const config = { id: 'desktop:primary', kind: 'desktop', enabled: true, displayId: String(display.id), displayLabel: display.label || 'isolated display', autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: 'acceptance', visible: true }, { moduleId: 'timers', visible: true }] };
 overlay = new OverlayHost((configuration, callbacks, generation) => {
  visualPort = PrivateOverlayWindow.create(configuration, callbacks, { trustedServiceOrigin: origin, generation });
  const load = visualPort.load.bind(visualPort); visualPort.load = async () => { await load(); visualPort.native.window.hide(); };
  const send = visualPort.send.bind(visualPort); visualPort.send = request => { const serialized = JSON.stringify(request); if (serialized.includes('med_') || serialized.includes('bytes')) throw new Error('Visual IPC leaked trusted media'); results.ipc.push({ command: `visual:${request.command.type}`, bytes: Buffer.byteLength(serialized) }); send(request); }; return visualPort;
 }, () => ({ available: true, displays: [{ id: String(display.id), label: 'isolated', bounds: display.bounds, scaleFactor: display.scaleFactor }] }), input => results.diagnostics.push({ source: input.source, message: input.message }));
 overlay.beginOwnership(); await overlay.configure(config); const visualLease = setInterval(() => overlay.refreshLease(), 1000);
 results.visuals = [];
 for (const [handle, file] of files) {
  if (file.snapshot.mimeType.startsWith('audio/')) continue;
  const key = { surfaceId: 'desktop:primary', moduleId: 'acceptance', occurrenceId: file.id, generation: 1 }; const timing = { startsAtEpochMs: Date.now()+10000, endsAtEpochMs: Date.now()+11000 };
  const prepared = await overlay.prepare({ key, timing, deferredStart: true, instructions: [{ id: file.id, overlayId: 'default', moduleId: 'acceptance', purpose: 'live', scope: 'module', durationMs: 1000, audio: null, tts: null, text: null, visual: { assetId: file.id, mediaType: file.snapshot.mimeType.startsWith('video/') ? 'video' : 'image', layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } }], assets: [{ assetId: file.id, grant: { handle, snapshot: file.snapshot, expiresAt: Date.now()+60000 } }] });
  if (prepared !== 'ready') throw new Error(`${file.id} desktop visual preparation failed`);
  const startsAtEpochMs = Date.now()+100; const result = await overlay.start(key, { startsAtEpochMs, endsAtEpochMs: startsAtEpochMs+1000 });
  results.visuals.push({ assetId: file.id, prepared, diagnostics: result });
 }
 const [imageHandle, image] = [...files].find(([,file]) => file.id === 'transparent-image');
 const card = { definitionId: 'isolated', generation: 'one', label: 'Isolated timer', iconAssetId: image.id, iconVersion: image.snapshot.version, status: 'paused', remainingMs: 1000, slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } };
 const sync = { moduleId: 'timers', revision: 1, presentation: { kind: 'timer-stack', stack: { targetProfileId: 'landscape', region: { layout: card.slot, orientation: 'vertical', maxVisible: 1 }, cards: [card], overflowCount: 0 } }, assets: [{ assetId: image.id, grant: { handle: imageHandle, snapshot: image.snapshot, expiresAt: Date.now()+2000 } }] };
 await overlay.syncModule(sync); await overlay.syncModule({ ...sync, assets: [{ ...sync.assets[0], grant: { ...sync.assets[0].grant, expiresAt: Date.now()+60000 } }] });
 await new Promise(accept => setTimeout(accept, 2200));
 results.timerRenewal = { expiredOriginalGrantStillRendered: await visualPort.native.window.webContents.executeJavaScript("[...document.querySelectorAll('img')].some(image => image.complete && image.naturalWidth > 0)") };
 if (!results.timerRenewal.expiredOriginalGrantStillRendered) throw new Error('Persistent timer icon did not survive renewal');
 await overlay.syncModule({ moduleId: 'timers', revision: 2, presentation: null, assets: [] });
 clearInterval(visualLease); await overlay.close();
 clearInterval(lease); await host.close(); await new Promise(accept => setTimeout(accept, 300));
 if (active !== 0) throw new Error('Readers did not return to baseline');
 await finish();
}).catch(finish);
