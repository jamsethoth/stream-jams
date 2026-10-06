import { expect, it } from "vitest";
import { z } from "zod";
import { isSchemaValidationError } from "./schema-validation-error.js";

it("accepts local and validated cross-realm Zod errors", () => {
  const result = z.string().safeParse(42);
  if (result.success) throw new Error("Expected invalid input");
  expect(isSchemaValidationError(result.error)).toBe(true);
  expect(isSchemaValidationError({ name: "ZodError", issues: [{ code: "invalid_type", path: ["name"], message: "Invalid input" }] })).toBe(true);
});

it.each([
  { name: "ZodError" }, { name: "ZodError", issues: [] },
  { name: "ZodError", issues: [{ code: 42, path: [], message: "invalid" }] },
  { name: "ZodError", issues: [{ code: "custom", path: [null], message: "invalid" }] },
  { name: "Other", issues: [{ code: "custom", path: [], message: "invalid" }] }
])("rejects unvalidated Zod lookalikes %j", (value) => {
  expect(isSchemaValidationError(value)).toBe(false);
});
