/*
 * HTML shells for the camera effects check pages. Their scripts are bundled at build time
 * (build-audio.mjs) and served from the same token-scoped path, so nothing loads from a CDN.
 * This is diagnostic tooling, not product UI.
 */

const shell = (title: string, script: string, style: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>${style}</style></head><body>${body}
<script type="module" src="app/${script}"></script></body></html>`;

export function blockedPage(reason: string): string {
  const escaped = reason.replace(/[&<>"]/gu, character => `&#${character.charCodeAt(0)};`);
  return shell("Stream Jams camera effects check", "control.js", "body { font: 15px/1.45 system-ui, sans-serif; margin: 24px; color: #1d2330; background: #f6f7f9; max-width: 980px; } .blocked { border: 2px solid #b42318; background: #fff; padding: 12px 16px; border-radius: 8px; }",
    `<h1>Camera effects check</h1><p class="blocked" role="alert"><b>Blocked.</b> ${escaped}</p>
<p>Check that Windows uses the graphics card driver (not "Microsoft Basic Display Adapter") and that nothing starts Stream Jams with <code>--disable-gpu</code>, then run the check again. You can still copy the results below.</p>
<h2>Results</h2><button id="copy">Copy results</button><span id="copied"></span><textarea id="results" readonly style="width:100%;height:260px"></textarea>`);
}

export function controlPage(): string {
  return shell("Stream Jams camera effects check", "control.js", `
    body { font: 15px/1.45 system-ui, sans-serif; margin: 24px; color: #1d2330; background: #f6f7f9; max-width: 1000px; }
    h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 24px; }
    fieldset { border: 1px solid #c9cfda; border-radius: 8px; margin: 12px 0; padding: 12px 16px; background: #fff; }
    label { display: block; margin: 6px 0; } input[type=text] { width: 420px; } input[type=number] { width: 80px; }
    button { margin: 6px 8px 6px 0; padding: 6px 12px; }
    code, textarea { font: 13px ui-monospace, monospace; } textarea { width: 100%; height: 300px; }
    table { border-collapse: collapse; } td, th { border: 1px solid #c9cfda; padding: 2px 8px; text-align: left; }
    .hint { color: #4b5566; } #status { font-weight: 600; }
  `, `
<h1>Camera effects check</h1>
<p class="hint">Runs the camera effects pipeline on this PC: camera, matte, face tracking, effects, and loopback WebRTC to OBS and a desktop window. Nothing here changes Stream Jams settings. When you are done, press <b>Copy results</b> and paste them in the thread.</p>
<p id="status" role="status">Starting</p>
<fieldset><legend>1. Camera</legend>
  <button id="list">List cameras</button> <select id="camera"></select> <button id="probe">Probe formats</button>
  <div id="formats"></div>
  <label>Format <select id="format"></select></label>
  <label><input type="checkbox" id="mirror"> Mirror image</label>
  <button id="open">Open camera</button>
</fieldset>
<fieldset><legend>2. Background</legend>
  <label><input type="radio" name="matte" value="none" checked> Keep the camera picture as it arrives (shows whether NVIDIA Broadcast's transparency survives)</label>
  <label><input type="radio" name="matte" value="key"> Key colour <input type="color" id="keyColor" value="#00ff00"> tolerance <input type="range" id="keyTolerance" min="0" max="1" step="0.01" value="0.25"></label>
  <label><input type="radio" name="matte" value="segmenter"> MediaPipe selfie segmentation</label>
  <label><input type="checkbox" id="pack"> Pack the alpha matte below the picture (transparent in OBS)</label>
</fieldset>
<fieldset><legend>3. Tracking and effects</legend>
  <label><input type="checkbox" id="tracking" checked> Face tracking (MediaPipe Face Landmarker, GPU)</label>
  <label><input type="checkbox" id="eyeBulge"> Bulge on both eyes</label>
  <label><input type="checkbox" id="bigEyes"> Big eyes (face mesh warp)</label>
  <label><input type="checkbox" id="glitch"> Glitch across the frame</label>
</fieldset>
<fieldset><legend>4. Outputs</legend>
  <label>Codec preference <select id="codec"><option>H264</option><option value="default">Chromium default (VP8)</option><option>VP9</option><option>AV1</option><option>VP8</option></select> <span class="hint">(receivers reconnect to apply it)</span></label>
  <label>Receiver encode size <select id="cap"><option value="1920">At most the 1920×1080 scene (product rule)</option><option value="1536">At most 1536×864 (a packed frame then fits H.264 level 4.2)</option><option value="camera">Camera size (4K stress test)</option></select></label>
  <p>OBS: add a <b>Browser Source</b> at 1920×1080 with this URL:</p>
  <p><code id="obsUrl"></code> <button id="copyUrl">Copy URL</button></p>
  <button id="desktopOpen">Open desktop overlay receiver</button><button id="desktopClose">Close desktop overlay receiver</button>
  <label><input type="checkbox" id="showPipeline" checked> Show the pipeline window (the product hides it)</label>
  <p>Layout on the scene: <button data-layout="0,0,1920,1080">Full scene</button><button data-layout="1280,720,640,360">Bottom right</button><button data-layout="480,270,960,540">Centre</button>
  x <input type="number" id="lx" value="0"> y <input type="number" id="ly" value="0"> width <input type="number" id="lw" value="1920"> height <input type="number" id="lh" value="1080"> <button id="applyLayout">Apply</button></p>
  <button id="barcode">Open the timing screen</button> <span class="hint">Point the camera at it so its grid fills the dashed box in the pipeline window; effects off.</span>
</fieldset>
<fieldset><legend>5. Run</legend>
  <label><input type="radio" name="scenario" value="idle" checked> Idle</label>
  <label><input type="radio" name="scenario" value="game"> With a game running: <input type="text" id="game" placeholder="Game and its settings"></label>
</fieldset>
<fieldset><legend>6. What you saw</legend>
  <label><input type="checkbox" data-manual="obsShows"> The processed camera shows in OBS</label>
  <label><input type="checkbox" data-manual="obsTransparent"> With the matte packed, the OBS source is transparent around me</label>
  <label><input type="checkbox" data-manual="desktopTransparent"> The desktop receiver is transparent around me</label>
  <label><input type="checkbox" data-manual="broadcastAlpha"> NVIDIA Broadcast's background removal stayed transparent with "Keep the camera picture"</label>
  <label><input type="checkbox" data-manual="noDrift"> Bulge and big eyes stay on my eyes during normal head movement</label>
  <label><input type="checkbox" data-manual="layoutNoReconnect"> Changing the layout moved the camera without a reconnect or flicker</label>
  <label>Key colour matte (hair, hands, chair edges) <input type="text" data-manual-text="keyMatte"></label>
  <label>MediaPipe matte (hair, hands, chair edges) <input type="text" data-manual-text="segmenterMatte"></label>
  <label>Compared with Broadcast's own result <input type="text" data-manual-text="broadcastComparison"></label>
  <label>Notes <input type="text" data-manual-text="notes" placeholder="Anything odd"></label>
</fieldset>
<h2>Results</h2>
<button id="copy">Copy results</button><span id="copied" class="hint"></span>
<textarea id="results" readonly></textarea>
`);
}

export function pipelinePage(): string {
  return shell("Camera effects check pipeline", "pipeline.js", `
    html, body { margin: 0; background: #20242c; color: #fff; font: 13px system-ui, sans-serif; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; }
    figure { margin: 0; position: relative; } figcaption { padding: 4px 0; }
    video, canvas { width: 100%; height: auto; display: block; background: repeating-conic-gradient(#555 0 25%, #777 0 50%) 0 0 / 24px 24px; }
    #guide { position: absolute; left: 20%; top: 25%; width: 60%; height: 50%; border: 3px dashed #ff3b6b; box-sizing: border-box; pointer-events: none; }
  `, `<main><figure><figcaption>Camera as received</figcaption><div style="position:relative"><video id="camera" playsinline muted></video><div id="guide"></div></div></figure>
<figure><figcaption>Processed output (with a packed matte, the matte shows below the picture)</figcaption><canvas id="output"></canvas></figure></main>`);
}

export function receiverPage(): string {
  return shell("Camera effects check receiver", "receiver.js", `
    html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
    body.desktop { -webkit-app-region: drag; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    video { display: none; }
    #status { position: absolute; right: 12px; bottom: 12px; font: 600 18px sans-serif; color: #fff; background: rgba(0,0,0,.6); padding: 6px 10px; border-radius: 6px; }
  `, `<canvas id="scene" width="1920" height="1080"></canvas><video id="video" playsinline muted></video><div id="status">Connecting</div>`);
}

export function barcodePage(): string {
  return shell("Camera effects check timing screen", "barcode.js", `
    html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; color: #fff; font: 16px system-ui, sans-serif; }
    #grid { position: absolute; display: grid; outline: 2vmin solid #fff; }
    p { position: absolute; left: 12px; bottom: 4px; margin: 0; }
  `, `<div id="grid"></div><p>Point the camera at this grid so it fills the dashed box in the pipeline window. F11 toggles full screen.</p>`);
}
