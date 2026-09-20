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
      void context.resume().catch(() => {});
    } catch {
      amplificationUnavailable = true;
      try { nextSource?.disconnect(); } catch { /* Continue releasing the partial graph. */ }
      try { nextGainNode?.disconnect(); } catch { /* Continue releasing the partial graph. */ }
      void nextContext?.close().catch(() => {});
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
      try { source?.disconnect(); } catch { /* Continue releasing the graph. */ }
      try { gainNode?.disconnect(); } catch { /* Continue releasing the graph. */ }
      void context?.close().catch(() => {});
      source = null; gainNode = null; context = null;
    }
  };
}

function defaultContextFactory(): (() => Context) | null {
  return typeof AudioContext === "undefined" ? null : () => new AudioContext();
}
