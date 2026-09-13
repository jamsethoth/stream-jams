import { expect, it } from "vitest";
import { VisualRecipientLedger } from "./visual-recipient-ledger.js";

it("settles each recipient once and rejects stale generations", () => {
  const ledger = new VisualRecipientLedger();
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "queue-1", generation: 2 };
  ledger.add(key); ledger.add(key);
  ledger.add({ ...key, moduleId: "second" });
  expect(ledger.pending("queue-1")).toBe(2);
  expect(ledger.settle({ ...key, generation: 1 })).toBe(false);
  expect(ledger.settle(key)).toBe(true);
  expect(ledger.settle(key)).toBe(false);
  expect(ledger.pending("queue-1")).toBe(1);
  expect(ledger.settle({ ...key, moduleId: "second" })).toBe(true);
  expect(ledger.pending("queue-1")).toBe(0);
});

it("keeps occurrence identities independent and validates keys", () => {
  const ledger = new VisualRecipientLedger();
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "queue-1", generation: 2 };
  ledger.add(key); ledger.add({ ...key, occurrenceId: "queue-2" });
  ledger.settle(key);
  expect(ledger.pending("queue-2")).toBe(1);
  expect(() => ledger.add({ ...key, generation: -1 })).toThrow();
});
