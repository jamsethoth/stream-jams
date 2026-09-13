import { expect, it } from "vitest";
import { visualRecipientKeySchema } from "./visual-recipient.js";

it("requires complete surface/module/occurrence/generation acknowledgement identity", () => {
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "occurrence-1", generation: 1 };
  expect(visualRecipientKeySchema.parse(key)).toEqual(key);
  for (const field of Object.keys(key)) {
    const incomplete: Record<string, unknown> = { ...key };
    delete incomplete[field];
    expect(visualRecipientKeySchema.safeParse(incomplete).success).toBe(false);
  }
  for (const generation of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    expect(visualRecipientKeySchema.safeParse({ ...key, generation }).success).toBe(false);
  }
  expect(visualRecipientKeySchema.safeParse({ ...key, moduleId: " " }).success).toBe(false);
  expect(visualRecipientKeySchema.safeParse({ ...key, credential: "unexpected" }).success).toBe(false);
});
