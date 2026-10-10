/*
 * The player paints the current time as a strip of black and white cells; the receiver
 * reads the strip back from the mirrored video to measure end-to-end delay. Both
 * functions are self-contained so the check pages can embed them with `toString()`.
 */

export const barcodeBits = 24;
export const barcodeCellPx = 24;

/** Low 24 bits of the millisecond clock, most significant bit first (wraps every ~4.6 hours). */
export function encodeTimestampBits(epochMs: number): boolean[] {
  const value = Math.floor(epochMs) & 0xffffff;
  const bits: boolean[] = [];
  for (let bit = 23; bit >= 0; bit -= 1) bits.push(((value >> bit) & 1) === 1);
  return bits;
}

/** Recovers the delay in ms from sampled cell luminances (0-255) and the receiver's clock. */
export function decodeDelayMs(luminances: readonly number[], receiverEpochMs: number): number | null {
  if (luminances.length !== 24) return null;
  let value = 0;
  for (const luminance of luminances) value = (value << 1) | (luminance < 128 ? 1 : 0);
  const now = Math.floor(receiverEpochMs) & 0xffffff;
  const delay = (now - value + 0x1000000) % 0x1000000;
  // Anything past a minute means the strip was unreadable or the video froze.
  return delay <= 60_000 ? delay : null;
}
