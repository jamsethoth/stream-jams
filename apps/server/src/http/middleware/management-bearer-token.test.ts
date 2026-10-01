import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./management-bearer-token.js";

describe("extractBearerToken", () => {
  it.each([
    [undefined, null],
    [["Bearer one", "Bearer two"] as string[], null],
    ["Basic abc123", null],
    ["Bearer", null],
    ["Bearer   ", null],
    ["Bearer\t\n mgmt_valid", "mgmt_valid"],
    ["Bearer mgmt with spaces", "mgmt with spaces"],
    ["Bearer mgmt\ninvalid", null],
    ["Bearer mgmt\rinvalid", null],
    ["Bearer mgmt\u2028invalid", null],
    ["Bearer mgmt\u2029invalid", null],
    ["Bearerx mgmt_invalid", null],
    ["Bearer mgmt_valid-session", "mgmt_valid-session"],
    ["  bearer   mgmt_trimmed  ", "mgmt_trimmed"]
  ] as const)("reads %j as %j", (value, expected) => {
    expect(extractBearerToken(value)).toBe(expected);
  });

  it("rejects a long whitespace prefix followed by a multiline token promptly", () => {
    const value = `Bearer${" ".repeat(100_000)}invalid\ninvalid`;
    const startedAt = performance.now();
    expect(extractBearerToken(value)).toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
