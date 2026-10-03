import { join } from "node:path";
import process from "node:process";
import { setTimeout, clearTimeout, setInterval, clearInterval } from "node:timers";
import { openStreamJamsDatabase } from "../../apps/server/dist/modules/db/database.js";
import { SqliteTimerDefinitionRepository } from "../../apps/server/dist/modules/timers/sqlite-timer-definition-repository.js";
import { SqliteTimerRunRepository } from "../../apps/server/dist/modules/timers/sqlite-timer-run-repository.js";
import { TimerRuntimeCoordinator } from "../../apps/server/dist/modules/timers/timer-runtime-coordinator.js";
import { timersOverlayModuleDefinition } from "../../packages/core/dist/index.js";

// This child owns only a disposable SQLite file. The crash test kills it without
// invoking close(), so it cannot accidentally exercise graceful shutdown instead.
const [root, mode] = process.argv.slice(2);
const database = openStreamJamsDatabase(join(root, "crash.sqlite"));
database.runMigrations();
const definitions = new SqliteTimerDefinitionRepository(database.connection);
const recovery = new SqliteTimerRunRepository(database.connection);
const cues = [];
const coordinator = new TimerRuntimeCoordinator({
  definitions, recovery,
  config: { getModuleConfig: async () => ({ moduleId: "timers", enabled: true, config: timersOverlayModuleDefinition.defaultConfig, updatedAt: new Date().toISOString() }) },
  clock: { now: () => Date.now() },
  scheduler: { schedule: (delay, callback) => { const handle = setTimeout(callback, delay); return { cancel: () => clearTimeout(handle) }; } },
  cueSink: { play: async ({ cue }) => { cues.push(cue); }, stop: async () => {} }
});
await coordinator.restore();
let poll;
process.on("message", async message => {
  if (message === "state") process.send({ type: "state", state: coordinator.getState("crash"), cues });
  if (message === "close") {
    clearInterval(poll);
    await coordinator.close(); database.close(); process.disconnect();
  }
});
if (mode === "start") {
  definitions.save({ id: "crash", label: "Crash acceptance", durationMs: 60000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await coordinator.start("crash");
  poll = setInterval(() => {
    const saved = recovery.list()[0];
    if (saved?.remainingMs < 60000) {
      clearInterval(poll);
      process.send({ type: "checkpoint", state: saved, cues });
    }
  }, 10);
} else process.send({ type: "restored", state: coordinator.getState("crash"), cues });
