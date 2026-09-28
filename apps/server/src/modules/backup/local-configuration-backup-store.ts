import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigurationBackupArchive } from "@stream-jams/core";

export interface LocalConfigurationBackupStoreOptions {
  readonly directory: string;
  readonly now?: () => Date;
}

export class LocalConfigurationBackupStore {
  readonly #directory: string;
  readonly #now: () => Date;

  constructor(options: LocalConfigurationBackupStoreOptions) {
    this.#directory = options.directory;
    this.#now = options.now ?? (() => new Date());
  }

  async write(archive: ConfigurationBackupArchive): Promise<string> {
    await mkdir(this.#directory, { recursive: true });
    const timestamp = this.#now().toISOString().replace(/[.:]/gu, "-");
    const destination = join(this.#directory, `pre-restore-${timestamp}.streamjams-backup`);
    const temporary = join(this.#directory, `.${randomUUID()}.tmp`);
    let temporaryCreated = false;
    try {
      await writeFile(temporary, `${JSON.stringify(archive)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      temporaryCreated = true;
      await rename(temporary, destination);
      return destination;
    } catch (error) {
      if (temporaryCreated) {
        try { await rm(temporary, { force: true }); }
        catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Backup write and temporary-file cleanup failed", { cause: error });
        }
      }
      throw error;
    }
  }
}
