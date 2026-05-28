import { describe, expect, it } from "vitest";
import { findSuggestedPorts, type PortAvailabilityChecker } from "./port-availability.js";

describe("findSuggestedPorts", () => {
  it("returns available ports after the preferred port and skips unavailable ports", async () => {
    const checker = new SetBasedPortAvailability(new Set([39188, 39190]));

    await expect(
      findSuggestedPorts({
        host: "127.0.0.1",
        preferredPort: 39187,
        count: 3,
        portAvailability: checker
      })
    ).resolves.toEqual([39189, 39191, 39192]);
    expect(checker.checks).toEqual([
      { host: "127.0.0.1", port: 39188 },
      { host: "127.0.0.1", port: 39189 },
      { host: "127.0.0.1", port: 39190 },
      { host: "127.0.0.1", port: 39191 },
      { host: "127.0.0.1", port: 39192 }
    ]);
  });

  it("stops at the maximum valid TCP port instead of wrapping around", async () => {
    const checker = new SetBasedPortAvailability(new Set([65_535]));

    await expect(
      findSuggestedPorts({
        host: "127.0.0.1",
        preferredPort: 65_534,
        count: 3,
        portAvailability: checker
      })
    ).resolves.toEqual([]);
    expect(checker.checks).toEqual([{ host: "127.0.0.1", port: 65_535 }]);
  });
});

/** Port-helper test double that treats a configured set of ports as unavailable. */
class SetBasedPortAvailability implements PortAvailabilityChecker {
  readonly checks: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

  constructor(private readonly unavailablePorts: ReadonlySet<number>) {}

  async isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean> {
    this.checks.push({ host, port });
    return !this.unavailablePorts.has(port);
  }
}
