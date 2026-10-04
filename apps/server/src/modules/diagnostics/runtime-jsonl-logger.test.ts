import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLogSettings, type LogContext, type Redactor } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRedactor } from "../security/redactor.js";
import { EmergencyLogWriter } from "./emergency-log-writer.js";
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
  it("strips raw quoted credentials from messages and nested exceptions in the real JSONL file", async () => {
    const logDirectory = await createTemporaryDirectory();
    const logger = new RuntimeJsonlLogger({ logDirectory, settings: defaultLogSettings, redactor: createRedactor(), now: () => new Date("2026-10-04T00:00:00.000Z") });
    await logger.error("Provider wss://alice:p'ass@localhost/events", baseContext, new Error('ws://bob:p",ass@[invalid]/events', { cause: new Error('https://cause:p"ass@safe.test/events?token=query-secret') }));
    const output = await readFile(join(logDirectory, "runtime-2026100400.jsonl"), "utf8");
    expect(output).toContain("wss://localhost/events");
    expect(output).toContain("ws://[invalid]/events");
    expect(output).toContain("https://safe.test/events");
    for (const secret of ["alice:", "bob:", "cause:", "p'ass", "query-secret"]) expect(output).not.toContain(secret);
  });

  it.each(["serialize", "redact", "append"] as const)(
    "keeps secrets out of emergency file and stderr after primary %s failure",
    async (failureStage) => {
      for (const failEmergencyFile of [false, true]) {
        const fileLines: string[] = [];
        const stderrLines: string[] = [];
        const stageFailure = new Error("Primary failed for wss://logger-user:logger-password@localhost:8080/events tmr_logger-secret");
        const emergencyWriter = new EmergencyLogWriter({
          filePath: "C:/logs/emergency.jsonl",
          appendFile: (_path, data) => {
            if (failEmergencyFile) throw new Error("Emergency file unavailable");
            fileLines.push(data);
          },
          writeStderr: (data) => { stderrLines.push(data); }
        });
        const logger = new RuntimeJsonlLogger({
          logDirectory: "C:/logs", settings: defaultLogSettings,
          redactor: failureStage === "redact"
            ? { redact() { throw stageFailure; }, redactText(value: string) { return value; } }
            : createRedactor(),
          emergencyWriter,
          fileSystem: {
            async mkdir() {},
            async appendFile() { throw stageFailure; },
            async readdir() { return []; },
            async readFile() { return ""; }
          },
          serialize: failureStage === "serialize" ? () => { throw stageFailure; } : undefined,
          now: () => new Date("2026-05-31T02:15:30.000Z")
        });

        await expect(logger.error(
          "Failed ws://message-user:message-password@localhost:8080/events med_message-secret",
          baseContext,
          new Error('Provider {"authentication":"challenge-secret"}', {
            cause: new Error("//cause-user:cause-password@localhost/events ovl_cause-secret")
          })
        )).resolves.toBeUndefined();

        expect(fileLines).toHaveLength(failEmergencyFile ? 0 : 1);
        expect(stderrLines).toHaveLength(failEmergencyFile ? 1 : 0);
        const output = [...fileLines, ...stderrLines].join("");
        expect(JSON.parse(output)).toMatchObject({ emergency: true, referenceId: "corr_123" });
        for (const secret of ["logger-user", "logger-password", "tmr_logger-secret", "message-user", "message-password",
          "med_message-secret", "challenge-secret", "cause-user", "cause-password", "ovl_cause-secret"]) {
          expect(output).not.toContain(secret);
        }
      }
    }
  );

  it("retains valid evidence around malformed records and reports corruption without exposing damaged text", async () => {
    const logDirectory = await createTemporaryDirectory();
    const now = new Date("2026-05-31T02:15:30.000Z");
    const logger = new RuntimeJsonlLogger({ logDirectory, settings: defaultLogSettings, redactor: createRedactor(), now: () => now });
    await logger.info("valid record", baseContext);
    const path = join(logDirectory, "runtime-2026053102.jsonl");
    await writeFile(path, (await readFile(path, "utf8")) + '\nnull\n{}\n{"secret":"oauth-secret"\n', "utf8");
    await logger.info("later valid record", baseContext);

    const result = await logger.listRecent({ limit: 10 });

    expect(result.entries.map(entry => entry.message)).toEqual([
      "Runtime log coverage is incomplete: 3 damaged records were skipped.", "later valid record", "valid record"
    ]);
    expect(result.skippedCorruptRecords).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.entries[0]).toMatchObject({ event: "diagnostics.runtime-log.corrupt-records", level: "WARN", details: { skippedCorruptRecords: 3, coverageIncomplete: true } });
    expect(JSON.stringify(result)).not.toContain("oauth-secret");
    const bounded = await logger.listRecent({ limit: 1 });
    expect(bounded.entries).toHaveLength(1);
    expect(bounded.truncated).toBe(true);
    expect(bounded.skippedCorruptRecords).toBe(3);
  });

  it("rejects invalid record shapes but preserves legacy records and limit semantics", async () => {
    const logDirectory = await createTemporaryDirectory();
    const logger = new RuntimeJsonlLogger({ logDirectory, settings: defaultLogSettings, redactor: createRedactor(), now: () => new Date("2026-05-31T02:15:30.000Z") });
    await logger.info("valid", baseContext);
    const path = join(logDirectory, "runtime-2026053102.jsonl");
    const valid = JSON.parse((await readFile(path, "utf8")).trim()) as Record<string, unknown>;
    await writeFile(path, [valid, { ...valid, timestamp: "invalid" }, { ...valid, level: "BOGUS" }, { ...valid, exception: {} }].map(value => JSON.stringify(value)).join("\n"), "utf8");
    const result = await logger.listRecent({ limit: 5, sinceHours: 1 });
    expect(result.skippedCorruptRecords).toBe(3);
    expect(result.entries).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

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
