import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalConfigurationBackupStore } from "./local-configuration-backup-store.js";

const directory = join(tmpdir(), "stream-jams-backup-store-test");

describe("LocalConfigurationBackupStore", () => {
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it("writes a complete safety archive with the backup extension", async () => {
    const store = new LocalConfigurationBackupStore({
      directory,
      now: () => new Date("2026-07-15T05:06:07.000Z")
    });
    const archive = { manifest: { format: "stream-jams-backup" } } as never;

    const path = await store.write(archive);

    expect(path).toBe(join(directory, "pre-restore-2026-07-15T05-06-07-000Z.streamjams-backup"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(archive);
  });
});
