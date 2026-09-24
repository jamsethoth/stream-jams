import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./management-bearer-token.js";

describe("extractBearerToken", () => {
  it.each([
    [undefined, null],
    [["Bearer one", "Bearer two"] as string[], null],
    ["Basic abc123", null],
    ["Bearer", null],
    ["Bearer mgmt_valid-session", "mgmt_valid-session"],
    ["  bearer   mgmt_trimmed  ", "mgmt_trimmed"]
  ] as const)("reads %j as %j", (value, expected) => {
    expect(extractBearerToken(value)).toBe(expected);
  });
});
