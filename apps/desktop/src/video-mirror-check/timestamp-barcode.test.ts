import { describe, expect, it } from "vitest";
import { SignalMailbox } from "./signal-mailbox.js";
import { decodeDelayMs, encodeTimestampBits } from "./timestamp-barcode.js";

const toLuminance = (bits: readonly boolean[]) => bits.map(bit => bit ? 20 : 235);

describe("timestamp barcode", () => {
  it("round-trips a timestamp into a delay", () => {
    const sent = 1_791_420_413_651;
    expect(decodeDelayMs(toLuminance(encodeTimestampBits(sent)), sent + 183)).toBe(183);
  });

  it("handles the 24-bit wrap and rejects unreadable strips", () => {
    const sent = 0xffffff - 10;
    expect(decodeDelayMs(toLuminance(encodeTimestampBits(sent)), sent + 40)).toBe(40);
    expect(decodeDelayMs(toLuminance(encodeTimestampBits(1_000)), 1_000 + 120_000)).toBeNull();
    expect(decodeDelayMs([1, 2, 3], 0)).toBeNull();
  });

  it("stays self-contained so pages can embed it", () => {
    expect(encodeTimestampBits.toString()).not.toMatch(/import|require/u);
    expect(decodeDelayMs.toString()).not.toMatch(/import|require/u);
  });
});

describe("SignalMailbox", () => {
  it("delivers messages per role in order and stays bounded", () => {
    const mailbox = new SignalMailbox(2);
    mailbox.post("receiver", "a");
    const second = mailbox.post("receiver", "b");
    mailbox.post("publisher", "x");
    mailbox.post("receiver", "c");
    expect(mailbox.read("receiver", 0).map(message => message.body)).toEqual(["b", "c"]);
    expect(mailbox.read("receiver", second).map(message => message.body)).toEqual(["c"]);
    expect(mailbox.read("publisher", 0).map(message => message.body)).toEqual(["x"]);
  });
});
