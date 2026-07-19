import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalConfigurationBackupStore } from "./local-configuration-backup-store.js";

vi.mock("node:crypto", () => ({ randomUUID: () => "fixed-temporary-id" }));

let directory: string;

describe("LocalConfigurationBackupStore", () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "stream-jams-backup-store-test-"));
  });

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

  it("does not overwrite an existing temporary file", async () => {
    const store = new LocalConfigurationBackupStore({ directory });
    const temporaryPath = join(directory, ".fixed-temporary-id.tmp");
    await writeFile(temporaryPath, "existing content", { encoding: "utf8", mode: 0o600 });

    await expect(store.write({ manifest: { format: "stream-jams-backup" } } as never)).rejects.toMatchObject({
      code: "EEXIST"
    });
    expect(await readFile(temporaryPath, "utf8")).toBe("existing content");
  });
});
