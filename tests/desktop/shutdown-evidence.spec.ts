import { expect, test } from "@playwright/test";
import { withShutdownEvidence } from "./shutdown-evidence.js";

test("shutdown evidence runs when both action and cleanup fail", async () => {
  const original = new Error("decision failed");
  const cleanup = new Error("close failed");
  let retained = false;
  const result = await withShutdownEvidence(async () => { throw original; }, async () => { throw cleanup; }, async () => { retained = true; }).catch((error: unknown) => error);
  expect(retained).toBe(true);
  expect((result as AggregateError).errors).toEqual([original, cleanup]);
});

test("attachment failure preserves the original shutdown failure", async () => {
  const original = new Error("decision failed");
  await expect(withShutdownEvidence(async () => { throw original; }, async () => undefined, async () => { throw new Error("attachment failed"); })).rejects.toBe(original);
});
