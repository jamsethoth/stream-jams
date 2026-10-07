import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// Management and Operator styles must draw font sizes from the --font-size-* scale in App.css.
// Browser-source and private overlay CSS render authored stream output and are exempt.
const roots = ["apps/web/src/App.css", "apps/web/src/management"];

async function cssFiles(path) {
  if (path.endsWith(".css")) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (
    entry.isDirectory() ? cssFiles(join(path, entry.name)) : entry.name.endsWith(".css") ? [join(path, entry.name)] : []
  )));
  return nested.flat();
}

test("management and Operator CSS uses only the type scale for font sizes", async () => {
  const files = (await Promise.all(roots.map(cssFiles))).flat();
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      if (/^\s*--font-size-/.test(line)) return;
      // Covers font-size and the font shorthand, whose size precedes an optional /line-height.
      const shorthand = /\bfont:\s*[^;]*?(?<![/\w.-])[\d.]+(px|rem|em|pt)\b/;
      if (/font-size:\s*-?[\d.]+(px|rem|em|pt)\b/.test(line) || shorthand.test(line)) violations.push(`${file}:${index + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, [], `Use var(--font-size-*) instead of raw sizes:\n${violations.join("\n")}`);
});

test("management and Operator CSS spacing stays on the 4px grid", async () => {
  const files = (await Promise.all(roots.map(cssFiles))).flat();
  const violations = [];
  const spacing = /\b((?:row-|column-)?gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      for (const [, , value] of line.matchAll(spacing)) {
        for (const [, size] of value.matchAll(/\b(\d+)px\b/g)) {
          // 1px and 2px hairlines are allowed; everything else uses multiples of 4.
          const pixels = Number(size);
          if (pixels > 2 && pixels % 4 !== 0) violations.push(`${file}:${index + 1} ${line.trim()}`);
        }
        // Relative units would bypass the grid; spacing uses px steps or theme variables.
        if (/(?<![\w.-])\d*\.?\d*[1-9]\d*(rem|em)\b/.test(value)) violations.push(`${file}:${index + 1} ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, [], `Use 4px-grid spacing:\n${violations.join("\n")}`);
});
