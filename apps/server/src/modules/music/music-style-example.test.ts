import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileMusicCss, validateMusicCss } from "@stream-jams/core/music-style-policy";
import { expect, it } from "vitest";

it("validates and namespaces the checked-in Music branded layout", () => {
  const source = readFileSync(resolve("docs/examples/music-branding.css"), "utf8");
  expect(validateMusicCss(source, 1)).toMatchObject({ valid: true });
  const compiled = compileMusicCss(source, 1, "example");
  expect(compiled.valid).toBe(true);
  if (compiled.valid) expect(compiled.css).toContain("example");
});
