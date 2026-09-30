/** Observes media time without seeking or changing playback. Muting does not stop media time. */
export function monitorMediaProgress(
  media: { readonly currentTime: number },
  onStall: (error: Error) => void,
  now: () => number = Date.now
): { finish(): boolean; stop(): void } {
  let position = media.currentTime;
  let lastProgress = now();
  const startedAt = lastProgress;
  let progressed = false;
  let stopped = false;
  const sample = () => {
    const current = media.currentTime;
    // Backwards movement is valid for looping media.
    if (Number.isFinite(current) && Math.abs(current - position) >= 0.001) {
      position = current;
      lastProgress = now();
      progressed = true;
    }
  };
  const stop = () => { stopped = true; clearInterval(timer); };
  const fail = () => {
    stop();
    onStall(new Error("Media playback stopped advancing. Check the media file and retry."));
    return false;
  };
  const timer = setInterval(() => {
    sample();
    if (now() - lastProgress >= 2000) fail();
  }, 250);
  return {
    finish() {
      if (stopped) return false;
      sample();
      // A short configured interval must still contain observable playback.
      if ((!progressed && now() > startedAt) || now() - lastProgress >= 2000) return fail();
      stop();
      return true;
    },
    stop
  };
}
