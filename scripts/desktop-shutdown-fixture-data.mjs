import { Buffer } from "node:buffer";

export function silenceWav() {
  const wav = Buffer.alloc(32_044);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(32_000, 40);
  return wav;
}

export function selectOutputIds(devices, labels) {
  if (!Array.isArray(labels) || labels.length !== 2 || labels.some(label => typeof label !== "string" || !label)) throw new Error("Two explicit output labels are required");
  const ids = labels.map(label => {
    const matches = devices.filter(device => device.label === label && device.deviceId && !["default", "communications"].includes(device.deviceId));
    if (matches.length !== 1) throw new Error(`Expected exactly one explicit output for ${label}; found ${matches.length}`);
    return matches[0].deviceId;
  });
  if (ids[0] === ids[1]) throw new Error("Outputs must be distinct");
  return ids;
}
