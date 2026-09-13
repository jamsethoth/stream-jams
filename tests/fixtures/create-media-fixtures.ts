import type { Page } from "@playwright/test";

/** Records generated media only. Audio is connected exclusively to a stream, never a device. */
export async function recordNeutralClip(page: Page, options: { width: number; height: number; durationMs: number; withAudio: boolean; mimeType?: string }): Promise<Uint8Array> {
  if (![options.width, options.height, options.durationMs].every(Number.isInteger) || options.width < 1 || options.height < 1 || options.width > 3840 || options.height > 2160 || options.durationMs < 1 || options.durationMs > 10_000) {
    throw new Error("Neutral recording requires dimensions up to 3840x2160 and duration 1-10000ms.");
  }
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  const recording = page.evaluate(async ({ width, height, durationMs, withAudio, mimeType: requestedMimeType }) => {
    const mimeType = requestedMimeType ?? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (mimeType === undefined || !MediaRecorder.isTypeSupported(mimeType)) throw new Error("Requested recording MIME type is unsupported.");
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (context === null) throw new Error("Canvas 2D unavailable.");
    const frameIntervalMs = 200;
    const stream = canvas.captureStream(1000 / frameIntervalMs);
    let audio: AudioContext | undefined;
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    let destination: MediaStreamAudioDestinationNode | undefined;
    let animation: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      if (withAudio) {
        audio = new AudioContext();
        oscillator = audio.createOscillator(); gain = audio.createGain();
        destination = audio.createMediaStreamDestination();
        oscillator.connect(gain); gain.connect(destination); gain.gain.value = 0;
        for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
        oscillator.start(); await audio.resume();
      }
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream, { mimeType });
      const activeRecorder = recorder;
      const stopped = new Promise<void>((resolveStopped, reject) => {
        activeRecorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
        activeRecorder.onstop = () => resolveStopped();
        activeRecorder.onerror = () => reject(new Error("Neutral MediaRecorder failed."));
      });
      console.info(`Neutral recording MIME: ${recorder.mimeType}`);
      const started = performance.now();
      const draw = (): void => {
        const elapsed = performance.now() - started;
        const pulse = Math.floor(elapsed / 250) % 2 === 0;
        context.clearRect(0, 0, width, height);
        context.fillStyle = pulse ? "#a0a0a0" : "#606060";
        context.fillRect(20 + elapsed / durationMs * (width - 120), height / 2, 64, 64);
        if (gain !== undefined) gain.gain.value = pulse ? 0.01 : 0;
      };
      draw();
      animation = setInterval(draw, frameIntervalMs);
      recorder.start(1000);
      timer = setTimeout(() => {
        if (activeRecorder.state !== "inactive") activeRecorder.stop();
      }, durationMs);
      await stopped;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()));
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (animation !== undefined) clearInterval(animation);
      if (recorder !== undefined && recorder.state !== "inactive") recorder.stop();
      oscillator?.stop(); oscillator?.disconnect(); gain?.disconnect();
      for (const track of stream.getTracks()) track.stop();
      for (const track of destination?.stream.getTracks() ?? []) track.stop();
      await audio?.close();
    }
  }, options);
  try {
    const bytes = await Promise.race([
      recording,
      new Promise<never>((_resolve, reject) => {
        completionTimer = setTimeout(() => reject(new Error(`Neutral MediaRecorder did not finish within ${options.durationMs + 15_000}ms.`)), options.durationMs + 15_000);
      })
    ]);
    return Uint8Array.from(bytes);
  } finally {
    if (completionTimer !== undefined) clearTimeout(completionTimer);
  }
}
