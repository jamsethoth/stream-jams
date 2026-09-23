import {
  resolveAlertAudio,
  resolveAudioEnvelope,
  type AlertEditorDocument
} from "@stream-jams/core";
import { createMediaGainController, type MediaGainController } from "../../../media/media-gain-controller.js";

export interface AlertPreviewState {
  readonly active: boolean;
  readonly playing: boolean;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly runId: number;
}

export interface AlertPreviewStartInput {
  readonly document: AlertEditorDocument;
  readonly ttsTextByLayerId: Readonly<Record<string, string>>;
  readonly includeAudio: boolean;
  readonly includeTts: boolean;
}

export interface AlertPreviewFailure {
  readonly summary: string;
  readonly cause: unknown;
  readonly nextStep: string;
}

export interface AlertPreviewController {
  getSnapshot(): AlertPreviewState;
  subscribe(listener: () => void): () => void;
  start(input: AlertPreviewStartInput): Promise<void>;
  play(): void;
  pause(): void;
  seek(elapsedMs: number): void;
  stop(): void;
  dispose(): void;
}

export type AlertPreviewAudioElement = HTMLAudioElement;

export interface AlertPreviewSpeech {
  available(): boolean;
  cancel(): void;
  speak(text: string): void;
}

export interface AlertPreviewControllerOptions {
  readonly getAssetFile: (assetId: string) => Promise<Blob>;
  readonly getVisualAssetMediaTypes: () => Readonly<Record<string, "image" | "gif" | "video">>;
  readonly getAssetDurations: () => Readonly<Record<string, number | null>>;
  readonly onError: (failure: AlertPreviewFailure) => void;
  readonly preparationTimeoutMs?: number;
  readonly now?: () => number;
  readonly wallNow?: () => number;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
  readonly createAudio?: (url: string) => AlertPreviewAudioElement;
  readonly createGainController?: (audio: AlertPreviewAudioElement) => MediaGainController;
  readonly speech?: AlertPreviewSpeech;
}

const initialState: AlertPreviewState = {
  active: false,
  playing: false,
  elapsedMs: 0,
  durationMs: 0,
  runId: 0
};

export function createAlertPreviewController(options: AlertPreviewControllerOptions): AlertPreviewController {
  const now = options.now ?? (() => performance.now());
  const wallNow = options.wallNow ?? (() => Date.now());
  const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  const createAudio = options.createAudio ?? ((url) => new Audio(url));
  const createGain = options.createGainController
    ?? ((audio) => createMediaGainController(audio as HTMLMediaElement));
  const speech = options.speech ?? browserSpeech();
  const preparationTimeoutMs = options.preparationTimeoutMs ?? 5_000;
  const listeners = new Set<() => void>();
  const mediaCleanup = new Set<() => void>();
  const mediaSync = new Set<() => void>();
  let state = initialState;
  let generation = 0;
  let disposed = false;
  let frameHandle: number | null = null;
  let completionTimer: number | null = null;
  let speechActive = false;
  let clock = { elapsedMs: 0, startedAt: 0, playing: false, durationMs: 0 };

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const updateState = (next: AlertPreviewState) => {
    if (disposed || Object.is(next, state)) return;
    state = next;
    emit();
  };
  const position = () => Math.min(
    clock.durationMs,
    clock.elapsedMs + (clock.playing ? now() - clock.startedAt : 0)
  );
  const cancelClockSchedule = () => {
    if (frameHandle !== null) cancelFrame(frameHandle);
    if (completionTimer !== null) window.clearTimeout(completionTimer);
    frameHandle = null;
    completionTimer = null;
  };
  const stopMedia = () => {
    for (const release of [...mediaCleanup]) release();
    mediaCleanup.clear();
    mediaSync.clear();
    if (speechActive) speech.cancel();
    speechActive = false;
  };
  const isCurrent = (expectedGeneration: number) => (
    !disposed && generation === expectedGeneration && state.active && position() < clock.durationMs
  );
  const finishPlayback = (expectedGeneration: number) => {
    if (disposed || generation !== expectedGeneration || !state.active) return;
    cancelClockSchedule();
    clock = { elapsedMs: clock.durationMs, startedAt: now(), playing: false, durationMs: clock.durationMs };
    stopMedia();
    updateState({ ...state, playing: false, elapsedMs: clock.durationMs });
  };
  const scheduleClock = (expectedGeneration: number) => {
    cancelClockSchedule();
    if (!clock.playing) return;
    const tick = () => {
      if (!isCurrent(expectedGeneration) || !clock.playing) return;
      const elapsedMs = Math.max(0, Math.min(clock.durationMs, Math.round(position())));
      if (elapsedMs >= clock.durationMs) {
        finishPlayback(expectedGeneration);
        return;
      }
      if (elapsedMs !== state.elapsedMs) updateState({ ...state, elapsedMs });
      frameHandle = requestFrame(tick);
    };
    frameHandle = requestFrame(tick);
    completionTimer = window.setTimeout(
      () => finishPlayback(expectedGeneration),
      Math.max(0, clock.durationMs - position())
    );
  };
  const syncMedia = () => {
    for (const sync of [...mediaSync]) sync();
  };
  const setPlayback = (playing: boolean, elapsedMs: number) => {
    if (disposed || !state.active) return;
    const nextElapsedMs = Math.max(0, Math.min(clock.durationMs, elapsedMs));
    const nextPlaying = playing && nextElapsedMs < clock.durationMs;
    clock = {
      elapsedMs: nextElapsedMs,
      startedAt: now(),
      playing: nextPlaying,
      durationMs: clock.durationMs
    };
    updateState({ ...state, playing: nextPlaying, elapsedMs: nextElapsedMs });
    if (nextPlaying) scheduleClock(generation);
    else cancelClockSchedule();
    syncMedia();
  };
  const prepare = <T,>(work: Promise<T>, deadline: number): Promise<T | null> => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      mediaCleanup.delete(cancel);
      complete();
    };
    const cancel = () => finish(() => resolve(null));
    mediaCleanup.add(cancel);
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("Preview media did not become ready within five seconds."))),
      Math.max(0, deadline - wallNow())
    );
    work.then(
      (value) => finish(() => resolve(value)),
      (cause: unknown) => finish(() => reject(cause))
    );
  });

  const prepareAudioLayer = async (
    input: AlertPreviewStartInput,
    layer: NonNullable<ReturnType<typeof resolveAlertAudio>>["layers"][number],
    expectedGeneration: number,
    preparationDeadline: number
  ) => {
    const blob = await prepare(options.getAssetFile(layer.assetId), preparationDeadline);
    if (blob === null || !isCurrent(expectedGeneration)) return;
    const url = createObjectUrl(blob);
    let audio: AlertPreviewAudioElement;
    let gain: MediaGainController;
    try {
      audio = createAudio(url);
      gain = createGain(audio);
    } catch (cause) {
      revokeObjectUrl(url);
      throw cause;
    }
    const updateEnvelope = () => {
      gain.setGain(resolveAudioEnvelope({
        volume: layer.volume,
        elapsedMs: position(),
        fadeInMs: layer.fadeInMs ?? 0,
        fadeOutMs: layer.fadeOutMs ?? 0,
        playbackDurationMs: layer.playbackDurationMs ?? input.document.durationMs,
        muted: false
      }));
    };
    const envelopeTimer = window.setInterval(updateEnvelope, 25);
    const release = () => {
      if (!mediaCleanup.delete(release)) return;
      audio.onended = null;
      audio.onloadedmetadata = null;
      audio.onerror = null;
      mediaSync.delete(sync);
      window.clearInterval(envelopeTimer);
      gain.dispose();
      audio.pause();
      audio.src = "";
      revokeObjectUrl(url);
    };
    mediaCleanup.add(release);
    audio.onended = () => {
      if (!isCurrent(expectedGeneration)) release();
    };
    updateEnvelope();
    let firstStart = true;
    const sync = () => {
      if (!isCurrent(expectedGeneration)) {
        release();
        return;
      }
      if (audio.readyState === 0) return;
      try {
        audio.currentTime = position() / 1_000;
        if (!clock.playing) {
          firstStart = false;
          audio.pause();
          return;
        }
        const startDeadline = firstStart ? preparationDeadline : wallNow() + preparationTimeoutMs;
        firstStart = false;
        void prepare(audio.play(), startDeadline).then(() => {
          if (!isCurrent(expectedGeneration)) release();
          else if (!clock.playing) audio.pause();
        }).catch((cause: unknown) => {
          release();
          if (isCurrent(expectedGeneration)) options.onError({
            summary: "Local preview media could not be played",
            cause,
            nextStep: "Check the selected media asset and browser audio permissions, then replay the preview."
          });
        });
      } catch (cause) {
        release();
        if (isCurrent(expectedGeneration)) options.onError({
          summary: "Local preview media could not seek",
          cause,
          nextStep: "Check the selected media asset, then replay the preview."
        });
      }
    };
    mediaSync.add(sync);
    if (audio.readyState === 0) {
      const ready = await prepare(new Promise<boolean>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(true);
        audio.onerror = () => reject(new Error("Preview media metadata could not be loaded."));
      }), preparationDeadline);
      if (ready === null || !isCurrent(expectedGeneration)) {
        release();
        return;
      }
    }
    audio.onloadedmetadata = null;
    audio.onerror = () => {
      release();
      if (isCurrent(expectedGeneration)) options.onError({
        summary: "Local preview media could not be played",
        cause: new Error("Media decoding failed."),
        nextStep: "Choose a supported media asset and replay the preview."
      });
    };
    sync();
  };

  const controller: AlertPreviewController = {
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start(input) {
      if (disposed) throw new Error("The alert preview controller has been disposed.");
      controller.stop();
      const expectedGeneration = generation;
      const durationMs = input.document.durationMs;
      clock = { elapsedMs: 0, startedAt: now(), playing: durationMs > 0, durationMs };
      updateState({ active: true, playing: durationMs > 0, elapsedMs: 0, durationMs, runId: state.runId + 1 });
      if (clock.playing) scheduleClock(expectedGeneration);
      const preparationDeadline = wallNow() + preparationTimeoutMs;
      try {
        if (input.includeAudio) {
          const audioLayers = resolveAlertAudio(
            input.document,
            options.getVisualAssetMediaTypes(),
            options.getAssetDurations()
          )?.layers ?? [];
          await Promise.all(audioLayers.map((layer) => prepareAudioLayer(
            input,
            layer,
            expectedGeneration,
            preparationDeadline
          )));
        }
        if (!isCurrent(expectedGeneration)) return;
        if (input.includeTts) {
          if (!speech.available()) throw new Error("This browser does not provide local speech synthesis.");
          speech.cancel();
          speechActive = true;
          input.document.layers.filter(
            (layer) => layer.visible && layer.type === "tts" && layer.enabled
          ).forEach((layer) => speech.speak(input.ttsTextByLayerId[layer.id] ?? ""));
        }
      } catch (cause) {
        if (!isCurrent(expectedGeneration)) return;
        stopMedia();
        options.onError({
          summary: "Local preview media could not be played",
          cause,
          nextStep: "Check the selected audio asset and browser audio permissions, then replay the preview."
        });
      }
    },
    play() {
      setPlayback(true, position());
    },
    pause() {
      setPlayback(false, position());
    },
    seek(elapsedMs) {
      setPlayback(false, elapsedMs);
    },
    stop() {
      if (disposed) return;
      generation += 1;
      cancelClockSchedule();
      stopMedia();
      clock = { elapsedMs: 0, startedAt: now(), playing: false, durationMs: 0 };
      updateState({ ...initialState, runId: state.runId });
    },
    dispose() {
      if (disposed) return;
      controller.stop();
      disposed = true;
      listeners.clear();
    }
  };
  return controller;
}

function browserSpeech(): AlertPreviewSpeech {
  return {
    available: () => typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined",
    cancel: () => speechSynthesis.cancel(),
    speak: (text) => speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  };
}
