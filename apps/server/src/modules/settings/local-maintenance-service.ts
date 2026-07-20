import { spawn } from "node:child_process";
import type { DiagnosticsLogRepository, LogSettings } from "@stream-jams/core";
import type { LogRetentionService } from "../diagnostics/log-retention-service.js";

export interface PathOpenerProcess {
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "spawn", listener: () => void): this;
  unref(): void;
}

export type SpawnPathProcess = (
  command: string,
  args: readonly string[],
  options: { readonly detached: true; readonly stdio: "ignore"; readonly windowsHide: true }
) => PathOpenerProcess;

export interface PlatformPathOpener {
  open(path: string): Promise<void>;
}

export interface LocalMaintenanceServiceOptions {
  readonly dataDirectory: string;
  readonly logDirectory: string;
  readonly logSettings: LogSettings;
  readonly logRetentionService: Pick<LogRetentionService, "cleanupExpiredLogs">;
  readonly diagnosticsLogRepository: Pick<DiagnosticsLogRepository, "pruneBefore">;
  readonly pathOpener: PlatformPathOpener;
  readonly now?: () => Date;
}

/** Keeps local maintenance bounded to paths and retention settings from application configuration. */
export class LocalMaintenanceService {
  readonly #options: LocalMaintenanceServiceOptions;
  readonly #now: () => Date;

  constructor(options: LocalMaintenanceServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  async openDataFolder() {
    await this.#options.pathOpener.open(this.#options.dataDirectory);
    return { dataDirectory: this.#options.dataDirectory };
  }

  async clearOldLogs() {
    const now = this.#now();
    const result = await this.#options.logRetentionService.cleanupExpiredLogs({
      logDirectory: this.#options.logDirectory,
      settings: this.#options.logSettings,
      now
    });
    const cutoff = new Date(
      now.getTime() - this.#options.logSettings.retentionHours * 60 * 60 * 1_000
    ).toISOString();
    let deletedRows = 0;
    while (true) {
      const counts = await this.#options.diagnosticsLogRepository.pruneBefore(cutoff, 500);
      const batchDeleted = counts.eventLogs + counts.alertMatchLogs + counts.playbackLogs;
      deletedRows += batchDeleted;
      if (batchDeleted === 0) break;
    }
    return { deletedCount: result.deletedFilePaths.length + deletedRows };
  }
}

export function createPlatformPathOpener(
  platform: NodeJS.Platform = process.platform,
  spawnProcess: SpawnPathProcess = (command, args, options) => spawn(command, [...args], options) as PathOpenerProcess
): PlatformPathOpener {
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  return {
    open(path) {
      return new Promise<void>((resolve, reject) => {
        const child = spawnProcess(command, [path], { detached: true, stdio: "ignore", windowsHide: true });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      });
    }
  };
}
