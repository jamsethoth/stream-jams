import { app, BrowserWindow, screen } from 'electron';
import { OverlayWindow } from './overlay/overlay-window.js';
import { appendFileSync } from 'node:fs';

app.disableHardwareAcceleration();
app.setPath('userData', process.env.STREAM_JAMS_PROBE_PROFILE);
app.on('window-all-closed', () => {});
const log = event => appendFileSync(process.env.STREAM_JAMS_PROBE_LAUNCH_LOG, `${event}\n`);
log('main-entry');
let attach;
const attached = new Promise(resolve => { attach = resolve; });
globalThis.__playwright_run = () => { log('playwright-attached'); attach(); };
void app.whenReady().then(async () => {
log('electron-ready');
await attached;
const display = screen.getPrimaryDisplay();
const bounds = { x: display.bounds.x + 80, y: display.bounds.y + 80, width: 400, height: 300 };
const html = color => `data:text/html,${encodeURIComponent(`<style>html,body{margin:0;width:100%;height:100%;background:${color}}</style><script>window.events=[];addEventListener('mousedown',e=>events.push({type:'mouse',button:e.button}));addEventListener('keydown',e=>events.push({type:'key',key:e.key}));</script>`)}`;
const competitors = await Promise.all(['#123456', '#123456'].map(async (color, index) => {
  const window = new BrowserWindow({ ...bounds, frame: false, show: false, title: `Owned topmost competitor ${index}` });
  await window.loadURL(html(color));
  window.setAlwaysOnTop(true, 'screen-saver');
  window.showInactive();
  return window;
}));
const marker = `data:text/html,${encodeURIComponent('<style>html,body{margin:0;background:transparent}#marker{position:fixed;left:80px;top:80px;width:400px;height:300px;background:#ff00ff}</style><div id="marker"></div>')}`;
const baseline = new BrowserWindow({ ...display.bounds, transparent: true, frame: false, focusable: false, show: false, backgroundColor: '#00000000' });
baseline.setIgnoreMouseEvents(true);
baseline.setAlwaysOnTop(true, 'screen-saver');
await baseline.loadURL(marker);
baseline.showInactive();
const overlay = OverlayWindow.create({ enabled: true, selectedId: String(display.id) });
if (!overlay) throw new Error('Owned display unavailable');
const handle = window => window.getNativeWindowHandle().readBigUInt64LE().toString();
globalThis.topmostProbe = { competitors, baseline, overlay, marker, handles: { competitors: competitors.map(handle), baseline: handle(baseline), overlay: handle(overlay.window) } };
log('windows-created');
app.on('before-quit', () => { overlay.destroy(); if (!baseline.isDestroyed()) baseline.destroy(); competitors.forEach(window => { if (!window.isDestroyed()) window.destroy(); }); });
}).catch(error => { log(`startup-failed:${error.name}:${error.message}`); app.quit(); });
