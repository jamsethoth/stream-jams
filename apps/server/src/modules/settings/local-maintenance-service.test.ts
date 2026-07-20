import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { LogRetentionService } from "../diagnostics/log-retention-service.js";
import {
  LocalMaintenanceService,
  createPlatformPathOpener,
  type PathOpenerProcess,
  type SpawnPathProcess
} from "./local-maintenance-service.js";

const dataDirectory = "C:/Users/James/.stream-jams/data";
const logDirectory = `${dataDirectory}/logs`;
const now = new Date("2026-07-18T12:00:00.000Z");
const logSettings = { level: "INFO" as const, rollover: "hourly" as const, retentionHours: 48 };

describe("createPlatformPathOpener", () => {
  it.each([
    ["win32", "explorer.exe"],
    ["darwin", "open"],
    ["linux", "xdg-open"]
  ] as const)("opens the configured directory on %s with %s", async (platform, command) => {
    const spawnProcess = successfulSpawn();

    await createPlatformPathOpener(platform, spawnProcess).open(dataDirectory);

    expect(spawnProcess).toHaveBeenCalledWith(command, [dataDirectory], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
  });

  it("rejects when the platform command cannot spawn", async () => {
    const spawnProcess = failingSpawn(new Error("Access denied"));

    await expect(createPlatformPathOpener("win32", spawnProcess).open(dataDirectory)).rejects.toThrow("Access denied");
  });
});

describe("LocalMaintenanceService", () => {
  it("opens only the configured data directory", async () => {
    const open = vi.fn(async () => undefined);
    const service = createService({ open });

    await expect(service.openDataFolder()).resolves.toEqual({ dataDirectory });
    expect(open).toHaveBeenCalledExactlyOnceWith(dataDirectory);
  });

  it("cleans only expired Stream Jams logs using the configured retention bound", async () => {
    const deleteFile = vi.fn(async () => undefined);
    const retentionService = new LogRetentionService({
      async listFiles() {
        return [
          { name: "runtime-2026071508.jsonl", filePath: `${logDirectory}/runtime-2026071508.jsonl`, modifiedAt: new Date("2026-07-15T08:00:00.000Z"), isFile: true },
          { name: "runtime-2026071808.jsonl", filePath: `${logDirectory}/runtime-2026071808.jsonl`, modifiedAt: new Date("2026-07-18T08:00:00.000Z"), isFile: true },
          { name: "notes.txt", filePath: `${logDirectory}/notes.txt`, modifiedAt: new Date("2026-07-10T08:00:00.000Z"), isFile: true }
        ];
      },
      deleteFile
    });

    await expect(createService({ open: vi.fn() }, retentionService).clearOldLogs()).resolves.toEqual({ deletedCount: 1 });
    expect(deleteFile).toHaveBeenCalledExactlyOnceWith(`${logDirectory}/runtime-2026071508.jsonl`);
  });

  it("reports zero deleted logs when the log directory does not exist", async () => {
    const missingDirectory = Object.assign(new Error("Missing log directory"), { code: "ENOENT" });
    const retentionService = new LogRetentionService({
      async listFiles() {
        throw missingDirectory;
      },
      async deleteFile() {
        throw new Error("deleteFile must not be called");
      }
    });

    await expect(createService({ open: vi.fn() }, retentionService).clearOldLogs()).resolves.toEqual({ deletedCount: 0 });
  });

  it("propagates cleanup failures for referenced HTTP error handling", async () => {
    const cleanupExpiredLogs = vi.fn(async () => {
      throw new Error("Log directory permission denied");
    });

    await expect(createService({ open: vi.fn() }, { cleanupExpiredLogs }).clearOldLogs()).rejects.toThrow(
      "Log directory permission denied"
    );
  });

  it("uses one cutoff and reports file plus bounded relational deletions", async () => {
    const cleanupExpiredLogs = vi.fn(async () => ({
      deletedFilePaths: [`${logDirectory}/runtime-2026071508.jsonl`],
      retainedFilePaths: []
    }));
    const pruneBefore = vi.fn()
      .mockResolvedValueOnce({ eventLogs: 2, alertMatchLogs: 1, playbackLogs: 0 })
      .mockResolvedValueOnce({ eventLogs: 0, alertMatchLogs: 0, playbackLogs: 0 });

    await expect(createService(
      { open: vi.fn() },
      { cleanupExpiredLogs },
      { pruneBefore }
    ).clearOldLogs()).resolves.toEqual({ deletedCount: 4 });

    expect(cleanupExpiredLogs).toHaveBeenCalledWith(expect.objectContaining({ now }));
    expect(pruneBefore).toHaveBeenNthCalledWith(1, "2026-07-16T12:00:00.000Z", 500);
    expect(pruneBefore).toHaveBeenNthCalledWith(2, "2026-07-16T12:00:00.000Z", 500);
  });
});

function createService(
  pathOpener: { readonly open: (path: string) => Promise<void> } = { open: vi.fn(async () => undefined) },
  logRetentionService: Pick<LogRetentionService, "cleanupExpiredLogs"> = new LogRetentionService(),
  diagnosticsLogRepository = {
    pruneBefore: vi.fn(async () => ({ eventLogs: 0, alertMatchLogs: 0, playbackLogs: 0 }))
  }
) {
  return new LocalMaintenanceService({
    dataDirectory,
    logDirectory,
    logSettings,
    logRetentionService,
    diagnosticsLogRepository,
    pathOpener,
    now: () => now
  });
}

function successfulSpawn(): ReturnType<typeof vi.fn<SpawnPathProcess>> {
  return vi.fn<SpawnPathProcess>(() => spawnResult("spawn"));
}

function failingSpawn(error: Error): ReturnType<typeof vi.fn<SpawnPathProcess>> {
  return vi.fn<SpawnPathProcess>(() => spawnResult("error", error));
}

function spawnResult(event: "spawn" | "error", error?: Error): PathOpenerProcess {
  const process = new EventEmitter() as EventEmitter & PathOpenerProcess;
  process.unref = vi.fn();
  queueMicrotask(() => process.emit(event, error));
  return process;
}
