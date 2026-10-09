import type { TwitchFrameOperation } from "./video-player-host.js";

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
    if (op === "pause") video.pause();
    if (op === "play") await video.play().catch(() => undefined);
    if (op === "seek" && Number.isFinite(video.duration)) video.currentTime = Math.min(${seconds}, Math.max(0, video.duration - 0.5));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null;
    return { video: true, paused: video.paused, ended: video.ended, positionMs: Math.max(0, Math.round(video.currentTime * 1000)), durationMs: duration };
  })()`;
}
