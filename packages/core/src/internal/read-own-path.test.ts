import { describe, expect, it } from "vitest";
import { readOwnPath } from "./read-own-path.js";

describe("readOwnPath", () => {
  it("reads own nested values and rejects inherited or empty segments", () => {
    const inherited = Object.create({ secret: "no" }) as Record<string, unknown>;
    inherited.actor = { displayName: "James" };

    expect(readOwnPath(inherited, "actor.displayName")).toBe("James");
    expect(readOwnPath(inherited, "secret")).toBeUndefined();
    expect(readOwnPath(inherited, "actor..displayName")).toBeUndefined();
    expect(readOwnPath(inherited, "")).toBeUndefined();
  });
});
