import assert from "node:assert/strict";
import { musicSnapshotSchema, type MusicSnapshot, type MusicSourceAdapter } from "@stream-jams/core";

export interface MusicSourceContractScenario {
  readonly adapter: MusicSourceAdapter;
  emitTrack(): Promise<void>;
  emitEmpty(): Promise<void>;
  /** Only adapters with session-selection capability supply this driver. */
  selectSession?(): Promise<void>;
}

/** Reusable behavioral contract for production and disposable source adapters. */
export async function assertMusicSourceContract(scenario: MusicSourceContractScenario): Promise<void> {
  const connected = await scenario.adapter.testConnection(AbortSignal.timeout(5_000));
  assert.ok(connected.transport === "ws" || connected.transport === "poll");
  assert.equal(connected.capabilities.sessionSelection, scenario.selectSession !== undefined);
  const snapshots: MusicSnapshot[] = [];
  const controller = new AbortController();
  try {
    await scenario.adapter.start(snapshot => { musicSnapshotSchema.parse(snapshot); snapshots.push(snapshot); }, () => {}, controller.signal);
    await waitUntil(() => snapshots.length > 0);
    assert.equal(snapshots.at(-1)?.track, null, "an empty but validated source is ready");
    await scenario.emitTrack();
    await waitUntil(() => snapshots.at(-1)?.track?.id === "contract_track");
    const trackSnapshot = snapshots.at(-1)!;
    assert.equal(trackSnapshot.providerId.length > 0, true);
    assert.equal(trackSnapshot.generation.length > 0, true);
    await scenario.emitEmpty();
    await waitUntil(() => snapshots.at(-1)?.revision !== trackSnapshot.revision && snapshots.at(-1)?.track === null);
    if (scenario.selectSession) {
      await scenario.selectSession();
      await waitUntil(() => snapshots.at(-1)?.session?.id === "session_selected");
    }
    const count = snapshots.length;
    controller.abort();
    await scenario.adapter.stop();
    await scenario.adapter.stop();
    await scenario.emitTrack();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(snapshots.length, count, "stopped adapters must discard late delivery");
    assert.equal(scenario.adapter.getSnapshot(), null);
  } finally { controller.abort(); await scenario.adapter.stop(); }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Music source contract observation timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
