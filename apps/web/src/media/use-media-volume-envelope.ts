import { resolveAudioEnvelope } from "@stream-jams/core";
import { useEffect, type RefObject } from "react";

const ENVELOPE_TICK_MS = 25;

export interface MediaVolumeEnvelope {
  readonly volume: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly playbackDurationMs: number;
  readonly startsAtEpochMs?: number | undefined;
  readonly muted: boolean;
}

export function useMediaVolumeEnvelope(
  ref: RefObject<HTMLMediaElement | null>,
  envelope: MediaVolumeEnvelope | null,
  active: boolean
): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null || envelope === null || !active) return;
    const localStartMs = Date.now() - element.currentTime * 1_000;
    const update = () => {
      const elapsedMs = envelope.startsAtEpochMs === undefined
        ? Date.now() - localStartMs
        : Date.now() - envelope.startsAtEpochMs;
      element.volume = resolveAudioEnvelope({ ...envelope, elapsedMs });
    };
    update();
    const timer = window.setInterval(update, ENVELOPE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, envelope, ref]);
}
