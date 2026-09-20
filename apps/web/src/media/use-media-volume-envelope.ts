import { resolveAudioEnvelope } from "@stream-jams/core";
import { useEffect, useRef, type RefObject } from "react";
import { createMediaGainController, type MediaGainController } from "./media-gain-controller.js";

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
  const gainController = useRef<{ element: HTMLMediaElement; controller: MediaGainController } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null || envelope === null || !active) return;
    if (gainController.current?.element !== element) {
      gainController.current?.controller.dispose();
      gainController.current = { element, controller: createMediaGainController(element) };
    }
    const localStartMs = Date.now() - element.currentTime * 1_000;
    const update = () => {
      const elapsedMs = envelope.startsAtEpochMs === undefined
        ? Date.now() - localStartMs
        : Date.now() - envelope.startsAtEpochMs;
      gainController.current?.controller.setGain(resolveAudioEnvelope({ ...envelope, elapsedMs }));
    };
    update();
    const timer = window.setInterval(update, ENVELOPE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, envelope, ref]);
  useEffect(() => () => {
    gainController.current?.controller.dispose();
    gainController.current = null;
  }, []);
}
