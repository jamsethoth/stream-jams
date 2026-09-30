import { TimedMediaPreparationError } from "./prepare-timed-media.js";

/** Readies a fresh, paused element without consuming any of its content. */
export function prepareMediaAtStart(element: {
  readonly readyState: number;
  readonly seeking: boolean;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}, options: { readonly signal: AbortSignal; readonly deadlineMs: number; readonly now?: () => number }): Promise<void> {
  const now = options.now ?? Date.now;
  if (!Number.isFinite(options.deadlineMs)) return Promise.reject(new TimedMediaPreparationError("metadata", "Media preparation deadline must be finite."));
  return new Promise((resolve, reject) => {
    let settled = false;
    const events = ["loadedmetadata", "loadeddata", "canplay", "seeked"];
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const event of events) element.removeEventListener(event, check);
      element.removeEventListener("error", failed);
      options.signal.removeEventListener("abort", aborted);
      if (error === undefined) resolve(); else reject(error);
    };
    const aborted = () => finish(new DOMException("Media preparation cancelled.", "AbortError"));
    const failed = () => finish(new TimedMediaPreparationError("decode", "The media failed during preparation."));
    const expired = () => finish(new TimedMediaPreparationError(element.readyState < 1 ? "metadata" : "decode", "Media preparation deadline exceeded."));
    const check = () => {
      if (options.signal.aborted) { aborted(); return; }
      if (now() >= options.deadlineMs) { expired(); return; }
      if (element.readyState >= 2 && !element.seeking) finish();
    };
    for (const event of events) element.addEventListener(event, check);
    element.addEventListener("error", failed);
    options.signal.addEventListener("abort", aborted, { once: true });
    const timer = setTimeout(expired, Math.max(0, options.deadlineMs - now()));
    check();
  });
}
