import { describe, expect, it } from "vitest";
import { createAppVersion } from "./version.js";

describe("createAppVersion", () => {
  it("returns the Stream Jams app name and supplied version", () => {
    expect(createAppVersion("1.2.3")).toEqual({
      name: "stream-jams",
      version: "1.2.3"
    });
  });
});
