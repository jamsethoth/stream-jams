import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLogSettings, type LogContext } from "@stream-jams/core";
import { afterEach, describe, expect, it } from "vitest";
import { createRedactor } from "../security/redactor.js";
import { RuntimeJsonlLogger } from "./runtime-jsonl-logger.js";

const temporaryDirectories: string[] = [];
const baseContext: LogContext = {
  module: "twitch",
  source: "provider.call",
  correlationId: "corr_123",
  processingId: "proc_456"
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("RuntimeJsonlLogger", () => {
  it("filters by level and writes allowlisted redacted JSONL fields", async () => {
    const logDirectory = await createTemporaryDirectory();
    const logger = new RuntimeJsonlLogger({
      logDirectory,
      settings: defaultLogSettings,
      redactor: createRedactor(),
      now: () => new Date("2026-05-31T02:15:30.000Z")
    });

    await logger.debug("debug detail", baseContext);
    await logger.info("Provider failed with Authorization: Bearer oauth-secret for ovl_secretKey", {
      ...baseContext,
      metadata: {
        outcome: "failed",
        statusCode: 502,
        authorization: "Bearer oauth-secret",
        overlayKey: "ovl_secretKey",
        rawProviderPayload: {
          token: "oauth-secret"
        },
        httpErrorBody: "oauth-secret",
        nested: {
          token: "oauth-secret"
        }
      }
    });

    const entries = await readJsonl(join(logDirectory, "runtime-2026053102.jsonl"));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      timestamp: "2026-05-31T02:15:30.000Z",
      level: "INFO",
      event: "provider.call",
      component: "twitch",
      message: "Provider failed with Authorization: Bearer [REDACTED] for [REDACTED]",
      correlationId: "corr_123",
      processingId: "proc_456",
      details: {
        outcome: "failed",
        statusCode: 502,
        authorization: "[REDACTED]",
        overlayKey: "[REDACTED]"
      }
    });
    expect(JSON.stringify(entries)).not.toContain("oauth-secret");
    expect(JSON.stringify(entries)).not.toContain("rawProviderPayload");
    expect(JSON.stringify(entries)).not.toContain("httpErrorBody");
    expect(JSON.stringify(entries)).not.toContain("nested");
  });

  it("rolls over hourly, exposes metadata, reads bounded recent entries, and applies default retention", async () => {
    const logDirectory = await createTemporaryDirectory();
    const staleFile = join(logDirectory, "runtime-2026052901.jsonl");
    const staleTime = new Date("2026-05-29T01:00:00.000Z");
    let now = new Date("2026-05-31T01:59:59.000Z");
    const logger = new RuntimeJsonlLogger({
      logDirectory,
      settings: defaultLogSettings,
      redactor: createRedactor(),
      now: () => now
    });

    await writeFile(staleFile, "{}\n", "utf8");
    await utimes(staleFile, staleTime, staleTime);
    await logger.warn("before rollover", baseContext);
    now = new Date("2026-05-31T02:00:00.000Z");
    await logger.warn("after rollover", baseContext);

    const files = (await readdir(logDirectory)).sort();
    const metadata = await logger.getMetadata();
    const recent = await logger.listRecent({ limit: 1 });

    expect(files).toEqual(["runtime-2026053101.jsonl", "runtime-2026053102.jsonl"]);
    expect(metadata).toEqual({
      logDirectory,
      level: "INFO",
      rollover: "hourly",
      retentionHours: 48,
      fileCount: 2,
      currentLogFile: "runtime-2026053102.jsonl",
      oldestLogFile: "runtime-2026053101.jsonl",
      newestLogFile: "runtime-2026053102.jsonl"
    });
    expect(recent.entries).toHaveLength(1);
    expect(recent.entries[0]?.message).toBe("after rollover");
    expect(recent.truncated).toBe(true);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-runtime-jsonl-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function readJsonl(filePath: string): Promise<unknown[]> {
  return (await readFile(filePath, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as unknown);
}
