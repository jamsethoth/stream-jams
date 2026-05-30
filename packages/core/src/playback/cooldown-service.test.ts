import { describe, expect, it } from "vitest";
import { DefaultPlaybackCooldownService } from "./cooldown-service.js";

describe("DefaultPlaybackCooldownService", () => {
  it("checks cooldown windows by rule ID and event type", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const cooldowns = new DefaultPlaybackCooldownService({ clock: () => clock.now() });

    cooldowns.recordPlayback({
      ruleId: "rule-cheer-large",
      eventType: "cheer",
      cooldownSeconds: 10
    });

    expect(cooldowns.canPlay({ ruleId: "rule-cheer-large", eventType: "cheer", cooldownSeconds: 10 })).toBe(false);
    expect(cooldowns.canPlay({ ruleId: "rule-cheer-small", eventType: "cheer", cooldownSeconds: 10 })).toBe(false);
    expect(cooldowns.canPlay({ ruleId: "rule-raid", eventType: "raid", cooldownSeconds: 10 })).toBe(true);

    clock.set("2026-05-30T12:00:11.000Z");

    expect(cooldowns.canPlay({ ruleId: "rule-cheer-large", eventType: "cheer", cooldownSeconds: 10 })).toBe(true);
    expect(cooldowns.canPlay({ ruleId: "rule-cheer-small", eventType: "cheer", cooldownSeconds: 10 })).toBe(true);
  });

  it("does not suppress zero-second cooldowns", () => {
    const cooldowns = new DefaultPlaybackCooldownService({
      clock: () => new Date("2026-05-30T12:00:00.000Z")
    });

    cooldowns.recordPlayback({
      ruleId: "rule-cheer",
      eventType: "cheer",
      cooldownSeconds: 0
    });

    expect(cooldowns.canPlay({ ruleId: "rule-cheer", eventType: "cheer", cooldownSeconds: 0 })).toBe(true);
  });

  it("filters ready subjects without recording new cooldowns", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const cooldowns = new DefaultPlaybackCooldownService({ clock: () => clock.now() });
    cooldowns.recordPlayback({
      ruleId: "rule-cheer",
      eventType: "cheer",
      cooldownSeconds: 10
    });

    expect(
      cooldowns.filterReady([
        { ruleId: "rule-cheer", eventType: "cheer", cooldownSeconds: 10, label: "blocked" },
        { ruleId: "rule-raid", eventType: "raid", cooldownSeconds: 10, label: "ready" }
      ])
    ).toEqual([{ ruleId: "rule-raid", eventType: "raid", cooldownSeconds: 10, label: "ready" }]);
  });
});

class MutableClock {
  #value: string;

  constructor(initialValue: string) {
    this.#value = initialValue;
  }

  set(value: string): void {
    this.#value = value;
  }

  now(): Date {
    return new Date(this.#value);
  }
}
