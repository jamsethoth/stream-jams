import { playbackTimingSchema, type PlaybackTiming } from "../overlays/playback-timing.js";

export interface TimedMediaElement {
  readonly readyState: number;
  readonly seeking: boolean;
  currentTime: number;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

/** Prepares only: the owner still controls mute, device binding, play and cleanup. */
export function prepareTimedMedia(element: TimedMediaElement, candidate: PlaybackTiming, options: {
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
  readonly now?: () => number;
}): Promise<void> {
  const timing = playbackTimingSchema.parse(candidate);
  const now = options.now ?? Date.now;
  if (!Number.isFinite(options.deadlineMs)) return Promise.reject(new Error("Media preparation deadline must be finite."));
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestedOffset: number | null = null;
    let seekAttempts = 0;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      clearTimeout(deadlineTimer);
      element.removeEventListener("loadedmetadata", check);
      element.removeEventListener("seeked", check);
      element.removeEventListener("error", failed);
      element.removeEventListener("ended", failed);
      options.signal.removeEventListener("abort", aborted);
      if (error === undefined) resolve(); else reject(error);
    };
    const aborted = () => finish(new DOMException("Media preparation cancelled.", "AbortError"));
    const failed = () => finish(new Error("The media ended or failed during preparation."));
    const check = () => {
      if (settled) return;
      if (options.signal.aborted) { aborted(); return; }
      const current = now();
      if (current >= timing.endsAtEpochMs) { finish(new Error("The media occurrence has expired.")); return; }
      if (current >= options.deadlineMs) { finish(new Error("Media preparation deadline exceeded.")); return; }
      if (current < timing.startsAtEpochMs || element.readyState < 1) return;
      const offset = (current - timing.startsAtEpochMs) / 1000;
      try {
        if (requestedOffset !== null) {
          if (element.seeking) return;
          if (Math.abs(element.currentTime - requestedOffset) > 0.02) { finish(new Error("The media did not reach its requested seek position.")); return; }
          // A completed asynchronous seek consumes wall time. Do not chase it
          // again when its onset remains within the declared local target.
          if (Math.abs(element.currentTime - offset) <= 0.15) { finish(); return; }
          if (seekAttempts >= 2) { finish(new Error("The media could not reach the shared offset within the timing target.")); return; }
        }
        if (Math.abs(element.currentTime - offset) <= 0.02 && !element.seeking) { finish(); return; }
        requestedOffset = offset;
        seekAttempts++;
        element.currentTime = offset;
        if (!element.seeking && Math.abs(element.currentTime - offset) <= 0.02) finish();
      } catch { finish(new Error("The media could not seek to the shared offset.")); }
    };
    element.addEventListener("loadedmetadata", check);
    element.addEventListener("seeked", check);
    element.addEventListener("error", failed);
    element.addEventListener("ended", failed);
    options.signal.addEventListener("abort", aborted, { once: true });
    const deadlineTimer = setTimeout(() => finish(new Error("Media preparation deadline exceeded.")), Math.max(0, Math.min(options.deadlineMs, timing.endsAtEpochMs) - now()));
    if (now() < timing.startsAtEpochMs) startTimer = setTimeout(check, timing.startsAtEpochMs - now());
    check();
  });
}
