import type { AudioOutputStatus } from "@stream-jams/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioApi } from "./audio-api.js";

const refreshIntervalMs = 4_000;

export interface AudioStatusState {
  readonly status: AudioOutputStatus | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useAudioStatus(audioApi: AudioApi): AudioStatusState {
  const [status, setStatus] = useState<AudioOutputStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const inFlightRef = useRef<{ readonly generation: number; readonly promise: Promise<void> } | null>(null);

  const refreshGeneration = useCallback((generation: number): Promise<void> => {
    const active = inFlightRef.current;
    if (active?.generation === generation) return active.promise;

    const promise = audioApi.getStatus()
      .then((nextStatus) => {
        if (generation !== generationRef.current) return;
        setStatus(nextStatus);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (generation !== generationRef.current) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
        if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
      });
    inFlightRef.current = { generation, promise };
    return promise;
  }, [audioApi]);

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    const active = inFlightRef.current;
    if (active?.generation === generation) await active.promise;
    if (generation !== generationRef.current) return;
    await refreshGeneration(generation);
  }, [refreshGeneration]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setStatus(null);
    setError(null);
    setLoading(true);
    void refreshGeneration(generation);

    const poll = () => {
      if (document.visibilityState === "visible") void refreshGeneration(generation);
    };
    const interval = window.setInterval(poll, refreshIntervalMs);
    document.addEventListener("visibilitychange", poll);
    return () => {
      generationRef.current += 1;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [audioApi, refreshGeneration]);

  return { status, loading, error, refresh };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Audio output status could not be refreshed.";
}
