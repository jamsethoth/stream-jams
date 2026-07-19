import { describe, expect, test } from "vitest";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  formatHours
} from "./formatters.js";

describe("management formatters", () => {
  test("formats dates with an explicit locale and a stable invalid fallback", () => {
    const value = new Date(2026, 6, 19, 13, 5);

    expect(formatDate(value, "en-US")).toBe("Jul 19, 2026");
    expect(formatDateTime(value, "en-US")).toBe("Jul 19, 2026, 1:05 PM");
    expect(formatDate("not-a-date", "en-US")).toBe("Invalid date");
    expect(formatDateTime("not-a-date", "en-US")).toBe("Invalid date");
  });

  test("formats binary byte values with deterministic units", () => {
    expect(formatBytes(512, "en-US")).toBe("512 B");
    expect(formatBytes(1024, "en-US")).toBe("1 KiB");
    expect(formatBytes(1536, "en-US")).toBe("1.5 KiB");
    expect(formatBytes(1024 * 1024, "en-US")).toBe("1 MiB");
  });

  test("selects localized singular and plural count labels", () => {
    const labels = { one: "use", other: "uses" };

    expect(formatCount(1, labels, "en-US")).toBe("1 use");
    expect(formatCount(2, labels, "en-US")).toBe("2 uses");
    expect(formatCount(1200, labels, "en-US")).toBe("1,200 uses");
  });

  test("formats exact days and otherwise retains hours", () => {
    expect(formatHours(0, "en-US")).toBe("0 hours");
    expect(formatHours(1, "en-US")).toBe("1 hour");
    expect(formatHours(2, "en-US")).toBe("2 hours");
    expect(formatHours(24, "en-US")).toBe("1 day");
    expect(formatHours(48, "en-US")).toBe("2 days");
    expect(formatHours(25, "en-US")).toBe("25 hours");
  });

  test("uses the document language when no locale is supplied", () => {
    const originalLanguage = document.documentElement.lang;
    document.documentElement.lang = "de-DE";

    try {
      expect(formatCount(1200, { one: "Nutzung", other: "Nutzungen" })).toBe(
        "1.200 Nutzungen"
      );
    } finally {
      document.documentElement.lang = originalLanguage;
    }
  });
});
