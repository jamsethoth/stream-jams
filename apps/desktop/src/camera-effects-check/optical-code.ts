/*
 * Glass-to-OBS timing. A screen shows the clock as 24 large cells; the camera films it and
 * the receiver reads the cells back from the processed picture. The clock is quantised and
 * Gray-coded so a camera exposure that straddles one change misreads by one step at most.
 */

export const opticalBits = 24;
/** One step is longer than a 30 fps exposure, so an exposure spans at most one change. */
export const opticalStepMs = 40;

/** Gray-coded clock steps, most significant bit first. */
export function encodeOpticalBits(epochMs: number): boolean[] {
  const step = Math.floor(epochMs / opticalStepMs) & 0xffffff;
  const gray = step ^ (step >> 1);
  const bits: boolean[] = [];
  for (let bit = opticalBits - 1; bit >= 0; bit -= 1) bits.push(((gray >> bit) & 1) === 1);
  return bits;
}

/**
 * Delay in ms from sampled cell luminances (0-255, dark = 1) and the receiver's clock. The
 * screen shows a step for its whole duration, so the read is centred on the step. Anything
 * outside 0 to 5 s means the cells were not framed or not readable.
 */
export function decodeOpticalDelayMs(luminances: readonly number[], receiverEpochMs: number, threshold = 128): number | null {
  if (luminances.length !== opticalBits) return null;
  let gray = 0;
  for (const luminance of luminances) gray = (gray << 1) | (luminance < threshold ? 1 : 0);
  let step = gray;
  for (let shift = gray >> 1; shift > 0; shift >>= 1) step ^= shift;
  const now = Math.floor(receiverEpochMs / opticalStepMs) & 0xffffff;
  const steps = (now - step + 0x1000000) % 0x1000000;
  const delay = steps * opticalStepMs + (receiverEpochMs % opticalStepMs) - opticalStepMs / 2;
  return delay >= 0 && delay <= 5_000 ? Math.round(delay) : null;
}

/** Midpoint between the darkest and brightest samples, so dim or washed-out filming still reads. */
export function adaptiveThreshold(luminances: readonly number[]): number | null {
  if (luminances.length === 0) return null;
  const low = Math.min(...luminances);
  const high = Math.max(...luminances);
  // Too little contrast means no code is in the guide box.
  return high - low < 40 ? null : (low + high) / 2;
}
