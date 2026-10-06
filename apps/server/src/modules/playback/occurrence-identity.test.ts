import { describe, expect, it } from "vitest";
import { moduleOccurrenceKey } from "./occurrence-identity.js";

describe("moduleOccurrenceKey", () => {
  it("preserves the serialized ownership identity and distinguishes ambiguous strings", () => {
    for (const pair of [["alerts", "one"], ["screen-effects", "one"], ["", ""], ['a"b', "c:d"]] as const) {
      expect(moduleOccurrenceKey(pair[0], pair[1])).toBe(JSON.stringify(pair));
    }
    expect(moduleOccurrenceKey("a:b", "c")).not.toBe(moduleOccurrenceKey("a", "b:c"));
  });
});
