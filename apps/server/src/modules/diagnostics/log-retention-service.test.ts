import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LogRetentionService,
  type LogFileEntry,
  type LogRetentionFileSystem
} from "./log-retention-service.js";

const logDirectory = "/tmp/stream-jams/logs";
const now = new Date("2026-05-26T14:00:00.000Z");

describe("LogRetentionService", () => {
  it("deletes Stream Jams log files older than the default 48 hour retention window", async () => {
    const oldLog = logFile("stream-jams-2026-05-24-13.log", "2026-05-24T13:59:59.000Z");
    const oldRuntimeLog = logFile("runtime-2026052413.jsonl", "2026-05-24T13:59:59.000Z");
    const boundaryLog = logFile("stream-jams-2026-05-24-14.log", "2026-05-24T14:00:00.000Z");
    const recentLog = logFile("stream-jams-2026-05-25-14.log", "2026-05-25T14:00:00.000Z");
    const ignoredTextFile = file("notes.txt", "2026-05-20T14:00:00.000Z");
    const ignoredDirectory = directory("stream-jams-2026-05-20-14.log", "2026-05-20T14:00:00.000Z");
    const fileSystem = new RecordingRetentionFileSystem([
      oldLog,
      oldRuntimeLog,
      boundaryLog,
      recentLog,
      ignoredTextFile,
      ignoredDirectory
    ]);
    const service = new LogRetentionService(fileSystem);

    const result = await service.cleanupExpiredLogs({ logDirectory, now });

    expect(fileSystem.deletedFilePaths).toEqual([oldLog.filePath, oldRuntimeLog.filePath]);
    expect(result).toEqual({
      deletedFilePaths: [oldLog.filePath, oldRuntimeLog.filePath],
      retainedFilePaths: [boundaryLog.filePath, recentLog.filePath]
    });
  });

  it("uses custom retention hours when provided", async () => {
    const staleLog = logFile("stream-jams-2026-05-26-00.log", "2026-05-26T00:59:59.000Z");
    const retainedLog = logFile("stream-jams-2026-05-26-03.log", "2026-05-26T03:00:00.000Z");
    const fileSystem = new RecordingRetentionFileSystem([staleLog, retainedLog]);
    const service = new LogRetentionService(fileSystem);

    const result = await service.cleanupExpiredLogs({
      logDirectory,
      now,
      settings: {
        level: "INFO",
        rollover: "hourly",
        retentionHours: 11
      }
    });

    expect(fileSystem.deletedFilePaths).toEqual([staleLog.filePath]);
    expect(result.retainedFilePaths).toEqual([retainedLog.filePath]);
  });

  it("treats a missing log directory as an empty cleanup", async () => {
    const fileSystem = new MissingDirectoryRetentionFileSystem();
    const service = new LogRetentionService(fileSystem);

    await expect(service.cleanupExpiredLogs({ logDirectory, now })).resolves.toEqual({
      deletedFilePaths: [],
      retainedFilePaths: []
    });
  });
});

/** Retention test filesystem that records deletes against an in-memory file listing. */
class RecordingRetentionFileSystem implements LogRetentionFileSystem {
  readonly deletedFilePaths: string[] = [];

  constructor(private readonly files: readonly LogFileEntry[]) {}

  async listFiles(): Promise<readonly LogFileEntry[]> {
    return this.files;
  }

  async deleteFile(filePath: string): Promise<void> {
    this.deletedFilePaths.push(filePath);
  }
}

/** Retention test filesystem that simulates a missing log directory. */
class MissingDirectoryRetentionFileSystem implements LogRetentionFileSystem {
  async listFiles(): Promise<readonly LogFileEntry[]> {
    throw Object.assign(new Error("missing directory"), { code: "ENOENT" });
  }

  async deleteFile(): Promise<void> {
    throw new Error("deleteFile should not be called for missing directories");
  }
}

function logFile(name: string, modifiedAt: string): LogFileEntry {
  return file(name, modifiedAt);
}

function file(name: string, modifiedAt: string): LogFileEntry {
  return {
    name,
    filePath: join(logDirectory, name),
    modifiedAt: new Date(modifiedAt),
    isFile: true
  };
}

function directory(name: string, modifiedAt: string): LogFileEntry {
  return {
    ...file(name, modifiedAt),
    isFile: false
  };
}
