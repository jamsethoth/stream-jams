import { describe, expect, it } from "vitest";
import { expectNever } from "./index.js";

describe("expectNever", () => {
  it("throws when called from an exhaustive branch", () => {
    expect(() => expectNever("unexpected" as never)).toThrow(
      "Unexpected value: unexpected"
    );
  });
});
