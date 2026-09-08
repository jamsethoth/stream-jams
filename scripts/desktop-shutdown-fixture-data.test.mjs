import assert from "node:assert/strict";
import { test } from "node:test";
import { selectOutputIds, silenceWav } from "./desktop-shutdown-fixture-data.mjs";

test("the diagnostic WAV contains one second of zero PCM, not a tone", () => {
  const wav = silenceWav();
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 16_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 32_000);
  assert.equal(wav.length, 32_044);
  assert(wav.subarray(44).every(value => value === 0));
});

test("routing requires distinct explicit outputs and never substitutes defaults", () => {
  const devices = [{ deviceId: "default", label: "System" }, { deviceId: "one", label: "System" }, { deviceId: "two", label: "SFX" }];
  assert.deepEqual(selectOutputIds(devices, ["System", "SFX"]), ["one", "two"]);
  assert.throws(() => selectOutputIds(devices.slice(0, 1), ["System", "SFX"]));
  assert.throws(() => selectOutputIds(devices, ["System", "missing"]));
  assert.throws(() => selectOutputIds([...devices, { deviceId: "three", label: "SFX" }], ["System", "SFX"]));
  assert.throws(() => selectOutputIds([{ deviceId: "one", label: "System" }, { deviceId: "one", label: "SFX" }], ["System", "SFX"]));
});
