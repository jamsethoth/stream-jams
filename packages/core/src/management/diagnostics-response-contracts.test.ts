import { describe, expect, it } from "vitest";
import { diagnosticsDebugExportViewSchema } from "./diagnostics-response-contracts.js";

describe("diagnostics debug export contract", () => {
  const valid = { generatedAt: "2026-10-05", debugExport: true, eventLogs: [], alertMatchLogs: [], playbackLogs: [],
    providerErrors: [], runtimeLogging: null, rawEventLogs: [{ providerPayload: { extension: true } }],
    runtimeLogEntries: [], runtimeLogTruncated: false, runtimeLogSkippedCorruptRecords: 3, extension: "retained" };
  it("preserves raw redacted data, extension fields and corrupt-record count", () => {
    expect(diagnosticsDebugExportViewSchema.parse(valid)).toEqual(valid);
  });
  it("rejects missing counts, wrong types and malformed nested records", () => {
    const missing: Record<string, unknown> = { ...valid };
    delete missing.runtimeLogSkippedCorruptRecords;
    for (const value of [missing, { ...valid, runtimeLogTruncated: 1 }, { ...valid, eventLogs: [{}] }, { ...valid, runtimeLogSkippedCorruptRecords: -1 }]) {
      expect(diagnosticsDebugExportViewSchema.safeParse(value).success).toBe(false);
    }
  });
});
