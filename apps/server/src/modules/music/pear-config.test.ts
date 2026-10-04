import { describe, expect, it } from "vitest";
import { buildPearAuthUrl, isLoopbackAddress, parsePearConfiguration } from "./pear-config.js";

describe("Pear configuration", () => {
  it("uses a single auth path for loopback IPv4, IPv6 and localhost", () => {
    for (const baseUrl of ["http://127.0.0.1:26538", "https://[::1]:26538", "http://localhost:26538"]) {
      const url = buildPearAuthUrl(parsePearConfiguration({ baseUrl, transport: "auto" }), "client-1");
      expect(url.pathname).toBe("/auth/client-1");
      expect(url.search).toBe("");
    }
  });

  it("rejects credentials, paths and nonloopback destinations", () => {
    for (const baseUrl of ["http://user:pass@localhost:26538", "http://localhost:26538/path", "http://10.0.0.1:26538"]) {
      expect(() => parsePearConfiguration({ baseUrl, transport: "auto" })).toThrow();
    }
  });

  it("recognizes only actual loopback socket addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.23.45.67")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackAddress("10.0.0.1")).toBe(false);
  });
});
