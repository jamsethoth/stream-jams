export interface MediaGainController {
  setGain(gain: number): void;
  dispose(): void;
}

type Context = Pick<AudioContext, "createGain" | "createMediaElementSource" | "destination" | "resume" | "close">;

export function createMediaGainController(element: HTMLMediaElement, createContext: (() => Context) | null = defaultContextFactory()): MediaGainController {
  let context: Context | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let disposed = false;
  let amplificationUnavailable = false;

  const ensureAmplifier = () => {
    if (context !== null || createContext === null || disposed || amplificationUnavailable) return;
    let nextContext: Context | null = null;
    let nextSource: MediaElementAudioSourceNode | null = null;
    let nextGainNode: GainNode | null = null;
    try {
      nextContext = createContext();
      nextSource = nextContext.createMediaElementSource(element);
      nextGainNode = nextContext.createGain();
      nextSource.connect(nextGainNode);
      nextGainNode.connect(nextContext.destination);
      context = nextContext;
      source = nextSource;
      gainNode = nextGainNode;
      element.volume = 1;
      void context.resume().catch(
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      () => {});
    }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch {
      amplificationUnavailable = true;
      try { nextSource?.disconnect(); }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch { /* Continue releasing the partial graph. */ }
      try { nextGainNode?.disconnect(); }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch { /* Continue releasing the partial graph. */ }
      void nextContext?.close().catch(
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      () => {});
    }
  };

  return {
    setGain(gain) {
      if (disposed) return;
      if (gain > 1) ensureAmplifier();
      if (gainNode === null) element.volume = Math.max(0, Math.min(1, gain));
      else gainNode.gain.value = Math.max(0, Math.min(2, gain));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { source?.disconnect(); }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch { /* Continue releasing the graph. */ }
      try { gainNode?.disconnect(); }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch { /* Continue releasing the graph. */ }
      void context?.close().catch(
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      () => {});
      source = null; gainNode = null; context = null;
    }
  };
}

function defaultContextFactory(): (() => Context) | null {
  return typeof AudioContext === "undefined" ? null : () => new AudioContext();
}
