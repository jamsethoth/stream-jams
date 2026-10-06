import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import process from "node:process";
import { scanErrorProvenance, scanErrorNames } from "./error-provenance-check.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots = ["packages/core/src", "apps/server/src", "apps/web/src", "apps/desktop/src"];
const diagnostics = [];
const sources = [];

for (const root of roots) {
  for (const file of await sourceFiles(resolve(repositoryRoot, root))) {
    const fileName = relative(repositoryRoot, file).replaceAll("\\", "/");
    const sourceText = await readFile(file, "utf8");
    sources.push({ fileName, sourceText });
    diagnostics.push(...scanErrorProvenance(sourceText, fileName));
  }
}
diagnostics.push(...scanErrorNames(sources));

diagnostics.sort((left, right) => left.fileName.localeCompare(right.fileName) || left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
for (const diagnostic of diagnostics) {
  console.error(`${diagnostic.fileName}:${diagnostic.line}:${diagnostic.column} ${diagnostic.rule} ${diagnostic.message}`);
}
if (diagnostics.length > 0) {
  console.error(`Error provenance check failed with ${diagnostics.length} violation${diagnostics.length === 1 ? "" : "s"}.`);
  process.exitCode = 1;
} else {
  console.log("Error provenance check passed.");
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|cts)$/u.test(entry.name)) files.push(path);
  }
  return files;
}
