import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { defaultLogSettings, logSettingsSchema, type LogSettings } from "@stream-jams/core";

const streamJamsLogFilePattern = /^stream-jams-\d{4}-\d{2}-\d{2}-\d{2}\.log$/;
const millisecondsPerHour = 60 * 60 * 1_000;

export interface LogFileEntry {
  readonly name: string;
  readonly filePath: string;
  readonly modifiedAt: Date;
  readonly isFile: boolean;
}

export interface LogRetentionFileSystem {
  listFiles(logDirectory: string): Promise<readonly LogFileEntry[]>;
  deleteFile(filePath: string): Promise<void>;
}

export interface LogRetentionCleanupInput {
  readonly logDirectory: string;
  readonly settings?: LogSettings;
  readonly now?: Date;
}

export interface LogRetentionResult {
  readonly deletedFilePaths: readonly string[];
  readonly retainedFilePaths: readonly string[];
}

/** Deletes expired Stream Jams log files while leaving unrelated files untouched. */
export class LogRetentionService {
  readonly #fileSystem: LogRetentionFileSystem;

  constructor(fileSystem: LogRetentionFileSystem = new NodeLogRetentionFileSystem()) {
    this.#fileSystem = fileSystem;
  }

  async cleanupExpiredLogs(input: LogRetentionCleanupInput): Promise<LogRetentionResult> {
    const settings = logSettingsSchema.parse(input.settings ?? defaultLogSettings);
    const now = input.now ?? new Date();
    const cutoffTime = now.getTime() - settings.retentionHours * millisecondsPerHour;
    const deletedFilePaths: string[] = [];
    const retainedFilePaths: string[] = [];
    let entries: readonly LogFileEntry[];

    try {
      entries = await this.#fileSystem.listFiles(input.logDirectory);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {
          deletedFilePaths,
          retainedFilePaths
        };
      }

      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile || !isStreamJamsLogFile(entry.name)) {
        continue;
      }

      if (entry.modifiedAt.getTime() < cutoffTime) {
        await this.#fileSystem.deleteFile(entry.filePath);
        deletedFilePaths.push(entry.filePath);
      } else {
        retainedFilePaths.push(entry.filePath);
      }
    }

    return {
      deletedFilePaths,
      retainedFilePaths
    };
  }
}

/** Adapts Node filesystem calls to the log-retention service boundary. */
class NodeLogRetentionFileSystem implements LogRetentionFileSystem {
  async listFiles(logDirectory: string): Promise<readonly LogFileEntry[]> {
    const entries = await readdir(logDirectory, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry) => {
        const filePath = join(logDirectory, entry.name);
        const stats = await stat(filePath);

        return {
          name: entry.name,
          filePath,
          modifiedAt: stats.mtime,
          isFile: entry.isFile()
        };
      })
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    await unlink(filePath);
  }
}

function isStreamJamsLogFile(name: string): boolean {
  return streamJamsLogFilePattern.test(name);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
