import { describe, expect, it } from "vitest";
import { findExactUniqueLabelMatch } from "./exact-label-match.js";

describe("findExactUniqueLabelMatch", () => {
  const candidates = [
    { id: "first", label: "Headphones" },
    { id: "second", label: "headphones" },
    { id: "third", label: "Speakers" }
  ] as const;

  it("returns the one exact case-sensitive match", () => {
    expect(findExactUniqueLabelMatch(candidates, "Headphones")).toEqual({
      kind: "one",
      value: candidates[0]
    });
  });

  it("returns none when no exact label matches", () => {
    expect(findExactUniqueLabelMatch(candidates, "HEADPHONES")).toEqual({ kind: "none" });
  });

  it("reports ambiguity without choosing by enumeration order", () => {
    const duplicate = [...candidates, { id: "fourth", label: "Headphones" }];
    expect(findExactUniqueLabelMatch(duplicate, "Headphones")).toEqual({ kind: "ambiguous", count: 2 });
  });
});
