import type { TwitchFrameOperation } from "./video-player-host.js";

/**
 * Hides provider player chrome (control bars, titles, play buttons, overlays) in the captured
 * player: everything in the provider frame is made invisible except its `<video>`, which fills
 * the frame. Visibility is inherited but a child may override it, so this needs no knowledge of
 * the provider's class names. Idempotent; runs on every provider frame load.
 */
export const providerFrameCleanScript = `(() => {
  if (document.getElementById("stream-jams-clean")) return true;
  const style = document.createElement("style");
  style.id = "stream-jams-clean";
  style.textContent = "html,body{background:#000!important;cursor:none!important}"
    + "body *{visibility:hidden!important}"
    + "video{visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;"
    + "object-fit:contain!important;z-index:2147483647!important;background:#000!important}";
  (document.head || document.documentElement).appendChild(style);
  return true;
})()`;

/** Runs inside the Twitch frame. It only reads and steers the first `<video>`; nothing is returned but numbers and flags. */
export function twitchFrameScript(operation: TwitchFrameOperation): string {
  const seconds = operation.type === "seek" ? operation.positionMs / 1000 : 0;
  return `(async () => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return { video: false };
    const op = ${JSON.stringify(operation.type)};
    // Twitch embeds often start muted and pick a low quality for a hidden player. The capture is the only
    // sound path (outputs and mute are applied downstream), so keep the provider audible, and remember full
    // volume and source quality in Twitch's own player settings for the next video.
    if (video.muted || video.volume < 1) { video.muted = false; video.volume = 1; }
    try {
      localStorage.setItem("video-muted", JSON.stringify({ default: false }));
      localStorage.setItem("volume", "1");
      localStorage.setItem("video-quality", JSON.stringify({ default: "chunked" }));
    } catch {}
    // Clip embeds ignore the stored quality, so once per page pick the best listed quality through the
    // player's own settings menu (hidden by the clean style). Best effort: missing menu items change nothing.
    const root = document.documentElement;
    if (root.dataset.streamJamsQuality === undefined && !video.paused && video.currentTime > 0) {
      root.dataset.streamJamsQuality = "tried";
      const wait = () => new Promise(resolve => setTimeout(resolve, 150));
      const click = selector => { const element = document.querySelector(selector); if (!(element instanceof HTMLElement)) return false; element.click(); return true; };
      if (click('[data-a-target="player-settings-button"]')) {
        await wait();
        if (click('[data-a-target="player-settings-menu-item-quality"]')) {
          await wait();
          const options = Array.from(document.querySelectorAll('[data-a-target="player-settings-submenu-quality-option"] input'));
          const best = options.find(option => !/auto/i.test(option.closest("label")?.textContent ?? option.parentElement?.textContent ?? ""));
          if (best instanceof HTMLElement && !best.checked) { best.click(); root.dataset.streamJamsQuality = "set"; }
        }
        click('[data-a-target="player-settings-button"]');
      }
    }
    if (op === "pause") video.pause();
    if (op === "play") await video.play().catch(() => undefined);
    if (op === "seek" && Number.isFinite(video.duration)) video.currentTime = Math.min(${seconds}, Math.max(0, video.duration - 0.5));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null;
    return { video: true, paused: video.paused, ended: video.ended, positionMs: Math.max(0, Math.round(video.currentTime * 1000)), durationMs: duration };
  })()`;
}
