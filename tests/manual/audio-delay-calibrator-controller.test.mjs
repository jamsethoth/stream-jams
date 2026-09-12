import assert from "node:assert/strict";
import test from "node:test";
import { createAudioDelayCalibrator } from "./audio-delay-calibrator-controller.mjs";

test("plays a reference immediately and the comparison at the requested delay", () => {
  const harness = createHarness();
  const calibrator = createAudioDelayCalibrator(harness.dependencies);

  calibrator.playPair({ delayMs: 137, referenceVolume: 0.8, comparisonVolume: 0.35 });
  assert.deepEqual(harness.starts, [{ channel: "reference", volume: 0.8 }]);
  assert.deepEqual(harness.scheduledDelays, [137]);
  harness.runScheduled();
  assert.deepEqual(harness.starts, [
    { channel: "reference", volume: 0.8 },
    { channel: "comparison", volume: 0.35 }
  ]);
});

test("keeps repeated plays alive concurrently until each player ends", () => {
  const harness = createHarness();
  const activeCounts = [];
  const calibrator = createAudioDelayCalibrator({
    ...harness.dependencies,
    onActiveCountChange: (count) => activeCounts.push(count)
  });

  calibrator.playReference(1);
  calibrator.playReference(0.5);

  assert.equal(calibrator.activeCount, 2);
  harness.end(0);
  assert.equal(calibrator.activeCount, 1);
  harness.end(1);
  assert.equal(calibrator.activeCount, 0);
  assert.deepEqual(activeCounts, [1, 2, 1, 0]);
});

test("stop all cancels delayed starts and silences every overlapping player", () => {
  const harness = createHarness();
  const calibrator = createAudioDelayCalibrator(harness.dependencies);

  calibrator.playPair({ delayMs: 200, referenceVolume: 1, comparisonVolume: 1 });
  calibrator.playDelayed({ delayMs: 300, volume: 0.6 });
  calibrator.playReference(0.4);
  calibrator.stopAll();
  harness.runScheduled();

  assert.equal(calibrator.activeCount, 0);
  assert.deepEqual(harness.stops, ["reference", "reference"]);
  assert.deepEqual(harness.starts, [
    { channel: "reference", volume: 1 },
    { channel: "reference", volume: 0.4 }
  ]);
});

test("normalizes comparison delay to whole milliseconds from zero through five hundred", () => {
  const harness = createHarness();
  const calibrator = createAudioDelayCalibrator(harness.dependencies);

  calibrator.playDelayed({ delayMs: -10, volume: 1 });
  calibrator.playDelayed({ delayMs: 125.6, volume: 1 });
  calibrator.playDelayed({ delayMs: 900, volume: 1 });

  assert.deepEqual(harness.starts, [{ channel: "comparison", volume: 1 }]);
  assert.deepEqual(harness.scheduledDelays, [126, 500]);
});

function createHarness() {
  const scheduled = [];
  const players = [];
  const starts = [];
  const stops = [];
  return {
    starts,
    stops,
    get scheduledDelays() { return scheduled.map(({ delayMs }) => delayMs); },
    dependencies: {
      schedule(callback, delayMs) {
        const entry = { callback, delayMs, cancelled: false };
        scheduled.push(entry);
        return entry;
      },
      cancelScheduled(entry) {
        entry.cancelled = true;
      },
      createPlayer({ channel, volume, onEnded }) {
        const player = {
          channel,
          onEnded,
          start() { starts.push({ channel, volume }); },
          stop() { stops.push(channel); }
        };
        players.push(player);
        return player;
      }
    },
    runScheduled() {
      for (const entry of scheduled.splice(0)) {
        if (!entry.cancelled) entry.callback();
      }
    },
    end(index) {
      players[index].onEnded();
    }
  };
}
