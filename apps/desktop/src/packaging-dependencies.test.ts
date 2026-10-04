import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// Resolve through Forge, not a hoisted package: this is the actual build-time
// dependency edge declared by the installed Packager manifest.
const desktopRequire = createRequire(new URL("../package.json", import.meta.url));
const forgeRequire = createRequire(desktopRequire.resolve("@electron-forge/core"));
const packagerRequire = createRequire(forgeRequire.resolve("@electron/packager"));
const { extractElectronZip } = packagerRequire("./unzip.js") as {
  extractElectronZip(zipPath: string, targetDir: string): Promise<void>;
};

// A stored ZIP containing only fixture.txt = "packaging fixture\n".
const fixtureZip = Buffer.from(
  "UEsDBBQAAAAAAAAAIQCxKvCiEgAAABIAAAALAAAAZml4dHVyZS50eHRwYWNrYWdpbmcgZml4dHVyZQpQSwECFAAUAAAAAAAAACEAsSrwohIAAAASAAAACwAAAAAAAAAAAAAAAAAAAAAAZml4dHVyZS50eHRQSwUGAAAAAAEAAQA5AAAAOwAAAAAA",
  "base64"
);

describe("Electron packaging dependencies", () => {
  it("uses Electron's maintained extractor instead of vulnerable extract-zip", async () => {
    const packagerManifestPath = packagerRequire.resolve("../package.json");
    const packagerManifest = JSON.parse(await readFile(packagerManifestPath, "utf8")) as { dependencies: Record<string, string> };
    expect(packagerManifest.dependencies["@electron-internal/extract-zip"]).toBeDefined();
    expect(packagerManifest.dependencies["extract-zip"]).toBeUndefined();
    const extractorRequire = createRequire(packagerManifestPath);
    const entry = extractorRequire.resolve("@electron-internal/extract-zip");
    const manifest: unknown = JSON.parse(await readFile(join(dirname(entry), "package.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "@electron-internal/extract-zip" });
    const extractor = await import(pathToFileURL(entry).href) as { default: unknown };
    expect(typeof extractor.default).toBe("function");
  });

  it("extracts through Packager's ESM wrapper and rejects a corrupt archive", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "stream-jams-packager-test-"));
    try {
      const archive = join(fixture, "fixture.zip");
      const output = join(fixture, "output");
      await writeFile(archive, fixtureZip);
      await extractElectronZip(archive, output);
      expect(await readFile(join(output, "fixture.txt"), "utf8")).toBe("packaging fixture\n");

      const corrupt = join(fixture, "corrupt.zip");
      await writeFile(corrupt, "not a ZIP archive");
      await expect(extractElectronZip(corrupt, join(fixture, "rejected"))).rejects.toThrow();
    } finally {
      // Only the directory returned by mkdtemp above is removed.
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
