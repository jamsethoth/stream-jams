import { musicSnapshotSchema, type MusicConnectionTestResult, type MusicSnapshot, type MusicSourceAdapter, type MusicStatus } from "@stream-jams/core";
import type { MusicSourceContractScenario } from "./music-source-contract.js";

/** Minimal disposable adapters proving the shared contract applies to push, poll and session sources. */
export function createDisposableMusicSourceFixture(mode: "push" | "poll" | "session"): MusicSourceContractScenario {
  let snapshot: MusicSnapshot | null = null;
  let publish: ((snapshot: MusicSnapshot) => void) | null = null;
  let revision = 0;
  let selected = false;
  const emit = (track: MusicSnapshot["track"]): void => {
    if (publish === null) return;
    snapshot = musicSnapshotSchema.parse({
      providerId: "fixture_provider", generation: "fixture_generation", revision: ++revision,
      track, playbackState: track ? "playing" : "stopped", positionMs: null, durationMs: null,
      observedAtEpochMs: Date.now(), session: selected ? { id: "session_selected", label: "Selected session" } : null
    });
    publish(snapshot);
  };
  const adapter: MusicSourceAdapter = {
    async testConnection(): Promise<MusicConnectionTestResult> {
      return { transport: mode === "poll" ? "poll" : "ws", capabilities: { artwork: false, position: false, duration: false, sessionSelection: mode === "session" } };
    },
    async start(onSnapshot: (value: MusicSnapshot) => void, onStatus: (value: MusicStatus) => void, signal: AbortSignal) {
      if (signal.aborted) throw signal.reason;
      publish = onSnapshot;
      onStatus({ state: "connected", stale: false, diagnosticReference: null });
      emit(null);
    },
    getSnapshot() { return snapshot; },
    async stop() { publish = null; snapshot = null; }
  };
  const scenario: MusicSourceContractScenario = {
    adapter,
    async emitTrack() { emit({ id: "contract_track", title: "Fixture", artists: ["Test"], album: null, artworkRef: null }); },
    async emitEmpty() { emit(null); },
    ...(mode === "session" ? { async selectSession() { selected = true; emit(null); } } : {})
  };
  return scenario;
}
