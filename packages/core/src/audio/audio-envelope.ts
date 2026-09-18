export interface AudioEnvelope {
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export interface ResolvedAudioEnvelope extends AudioEnvelope {
  readonly playbackDurationMs: number;
}

export function resolveAudioEnvelope(input: {
  readonly volume: number;
  readonly elapsedMs: number;
  readonly playbackDurationMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly muted: boolean;
}): number {
  if (input.muted || input.playbackDurationMs <= 0 || input.elapsedMs >= input.playbackDurationMs) return 0;
  const elapsedMs = Math.max(0, input.elapsedMs);
  const requestedTotal = input.fadeInMs + input.fadeOutMs;
  const scale = requestedTotal > input.playbackDurationMs && requestedTotal > 0
    ? input.playbackDurationMs / requestedTotal
    : 1;
  const fadeInMs = input.fadeInMs * scale;
  const fadeOutMs = input.fadeOutMs * scale;
  const fadeInGain = fadeInMs === 0 ? 1 : Math.min(1, elapsedMs / fadeInMs);
  const fadeOutStart = input.playbackDurationMs - fadeOutMs;
  const fadeOutGain = fadeOutMs === 0 || elapsedMs <= fadeOutStart
    ? 1
    : Math.max(0, (input.playbackDurationMs - elapsedMs) / fadeOutMs);
  return Math.max(0, Math.min(input.volume, input.volume * Math.min(fadeInGain, fadeOutGain)));
}
