import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLogSettings, type LogContext, type Redactor } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    const metadata = {
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
    };
    const metadataBeforeLogging = structuredClone(metadata);
    await logger.info("Provider failed with Authorization: Bearer oauth-secret for ovl_secretKey", {
      ...baseContext,
      metadata
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
      exception: null,
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
    expect(metadata).toEqual(metadataBeforeLogging);
  });

  it("writes a redacted structured exception with code and nested cause", async () => {
    const logDirectory = await createTemporaryDirectory();
    const logger = new RuntimeJsonlLogger({
      logDirectory,
      settings: defaultLogSettings,
      redactor: createRedactor(),
      now: () => new Date("2026-05-31T02:15:30.000Z")
    });
    const cause = new Error("Inner failed with Bearer oauth-secret");
    const failure = Object.assign(new Error("Overlay ovl_secretKey failed", { cause }), { code: "E_PLAYBACK" });

    await logger.error("Playback failed", baseContext, failure);

    const entries = await readJsonl(join(logDirectory, "runtime-2026053102.jsonl"));
    expect(entries[0]).toMatchObject({
      level: "ERROR",
      correlationId: "corr_123",
      exception: {
        type: "Error",
        message: "Overlay [REDACTED] failed",
        code: "E_PLAYBACK",
        thrownValue: null,
        cause: {
          type: "Error",
          message: "Inner failed with Bearer [REDACTED]",
          cause: null
        }
      }
    });
    expect(JSON.stringify(entries)).not.toContain("oauth-secret");
    expect(JSON.stringify(entries)).not.toContain("ovl_secretKey");
  });

  it("persists the primary cause and bounded secondary failures from AggregateError", async () => {
    const logDirectory = await createTemporaryDirectory();
    const logger = new RuntimeJsonlLogger({
      logDirectory,
      settings: defaultLogSettings,
      redactor: createRedactor(),
      now: () => new Date("2026-05-31T02:15:30.000Z")
    });
    const primary = new Error("Import failed for token=oauth-secret");
    const cleanup = new Error("Rollback failed for password=hunter2");

    await logger.error(
      "Import and rollback failed",
      baseContext,
      new AggregateError([cleanup], "Import and rollback failed", { cause: primary })
    );

    const entries = await readJsonl(join(logDirectory, "runtime-2026053102.jsonl"));
    expect(entries[0]).toMatchObject({
      exception: {
        type: "AggregateError",
        cause: { message: "Import failed for token=[REDACTED]" },
        secondary: [{ message: "Rollback failed for password=[REDACTED]" }]
      }
    });
    expect(JSON.stringify(entries)).not.toContain("oauth-secret");
    expect(JSON.stringify(entries)).not.toContain("hunter2");
  });

  it("normalizes historical JSONL entries without an exception field", async () => {
    const logDirectory = await createTemporaryDirectory();
    await writeFile(join(logDirectory, "runtime-2026053102.jsonl"), `${JSON.stringify({
      timestamp: "2026-05-31T02:15:30.000Z",
      level: "ERROR",
      event: "legacy.failure",
      component: "runtime",
      message: "Legacy failure",
      correlationId: "err_legacy",
      processingId: null
    })}\n`, "utf8");
    const logger = new RuntimeJsonlLogger({
      logDirectory,
      settings: defaultLogSettings,
      redactor: createRedactor(),
      now: () => new Date("2026-05-31T02:15:30.000Z")
    });

    const result = await logger.listRecent({ limit: 1 });

    expect(result.entries[0]).toMatchObject({ message: "Legacy failure", exception: null });
  });

  it.each(["serialize", "redact", "mkdir", "append", "retention"] as const)(
    "uses emergency logging when %s fails without rejecting the logger call",
    async (failureStage) => {
      const emergencyWriter = { write: vi.fn() };
      const stageFailure = new Error(`${failureStage} failed`);
      const fileSystem = {
        mkdir: vi.fn(async () => { if (failureStage === "mkdir") throw stageFailure; }),
        appendFile: vi.fn(async () => { if (failureStage === "append") throw stageFailure; }),
        readdir: vi.fn(async () => [] as string[]),
        readFile: vi.fn(async () => "")
      };
      const redactor = failureStage === "redact"
        ? { redact() { throw stageFailure; }, redactText(value: string) { return value; } } satisfies Redactor
        : createRedactor();
      const logger = new RuntimeJsonlLogger({
        logDirectory: "C:/logs",
        settings: defaultLogSettings,
        redactor,
        emergencyWriter,
        fileSystem,
        retentionService: { async cleanupExpiredLogs() {
          if (failureStage === "retention") throw stageFailure;
          return { deletedFilePaths: [], retainedFilePaths: [] };
        } },
        serialize: failureStage === "serialize" ? () => { throw stageFailure; } : undefined,
        now: () => new Date("2026-05-31T02:15:30.000Z")
      });
      const original = new Error("original operation failed");

      await expect(logger.error("Operation failed", baseContext, original)).resolves.toBeUndefined();

      expect(emergencyWriter.write).toHaveBeenCalledWith(expect.objectContaining({
        referenceId: "corr_123",
        originalException: original,
        loggerException: stageFailure
      }));
    }
  );

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
    expect(recent.entries[0]?.exception).toBeNull();
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
