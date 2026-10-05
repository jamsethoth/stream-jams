import { describe, expect, it } from "vitest";
import { compileMusicCss, validateMusicCss } from "./style-policy.js";

const valid = [
  ".sj-title { color: red; }",
  ".sj-content { display: grid; grid-template-columns: 1fr auto; } .sj-artwork { grid-column: 2; }",
  ".sj-content[data-view=compact] .sj-progress-track { position: absolute; top: 0; }",
  ".sj-title::before { content: '♪'; } .sj-title::after { content: ''; }",
  "@media (max-width: 600px) { .sj-title { font-size: 18px; } }",
  "@supports (display: flex) { .sj-content { display: flex; } }",
  "@container (min-width: 300px) { .sj-brand-image { opacity: .5; } }",
  "@keyframes fade { from { opacity: 0; } to { opacity: 1; } } .sj-title { animation: fade 2s ease-in; }",
  "@keyframes fade { 50% { opacity: .5; } } .sj-title { animation: fade 2s steps(2, start); }",
  ".sj-title { --sj-local: #123456; color: var(--sj-local); }",
  ".sj-title { color: var(--sj-title-color); }",
  ".sj-\\74itle { color: red; }"
];

const invalid = [
  ":host { display: none; }",
  ":root { color: red; }",
  "body .sj-title { color: red; }",
  "#app .sj-title { color: red; }",
  ".sj-managed-frame { color: red; }",
  ".sj-title::slotted(*) { color: red; }",
  ".sj-title, .other-widget { color: red; }",
  ".sj-title[data-view=full] { color: red; }",
  "@import 'https://example.invalid/x.css';",
  "@im\\70ort 'https://example.invalid/x.css';",
  "@font-face { font-family: x; src: url(https://example.invalid/x); }",
  ".sj-title { background: u\\72l(https://example.invalid/x); }",
  ".sj-title { background: image-set('https://example.invalid/x' 1x); }",
  ".sj-title { background: attr(data-x url); }",
  ".sj-title { background: paint(worklet); }",
  ".sj-title { width: expression(alert(1)); }",
  ".sj-title::before { content: '</style><script>alert(1)</script>'; }",
  ".sj-title::before { content: '\\3C script>'; }",
  ".sj-title { behavior: url(x); }",
  ".sj-title { -moz-binding: url(x); }",
  ".sj-title { --a: url(https://example.invalid/x); background: var(--a); }",
  ".sj-title { --a: image-set('https://example.invalid/x'); background: var(--a); }",
  ".sj-title { color: var(--unapproved); }",
  ".sj-title { --a: var(--b); --b: var(--a); color: var(--a); }",
  ".sj-title { color: var(--unapproved, red); }",
  ".sj-title { --sj-title-color: url(x); color: var(--sj-title-color); }",
  ".sj-title { color: var(--sj-title-color, url(x)); }",
  ".sj-title { --a: red; color: var(--a); display: imaginary-layout; }",
  ".sj-title { color: red; broken declaration }",
  ".sj-title { color: red; } @namespace x 'evil';",
  "@media (min-width:1px) { color: red; }",
  ".sj-title { .sj-artists { color: red; } }",
  "@keyframes fade { color: red; }",
  "@keyframes fade { 100.5% { opacity: 1; } }"
];

describe("Music CSS policy", () => {
  it.each(valid)("accepts supported CSS: %s", source => {
    const result = validateMusicCss(source, 1);
    expect(result).toMatchObject({ valid: true });
  });

  it.each(invalid)("rejects unsupported or unsafe CSS with a location: %s", source => {
    const result = validateMusicCss(source, 1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.line).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]?.column).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]?.message).toBeTruthy();
    }
  });

  it("enforces UTF-8 bytes and the rule, declaration, and nesting limits", () => {
    expect(validateMusicCss(`/*${"é".repeat(16382)}*/`, 1).valid).toBe(true);
    expect(validateMusicCss(`/*${"é".repeat(16383)}*/`, 1).valid).toBe(false);
    expect(validateMusicCss(".sj-title{top:0}".repeat(512), 1).valid).toBe(true);
    expect(validateMusicCss(".sj-title{top:0}".repeat(513), 1).valid).toBe(false);
    const declarations = `.sj-title{${"top:0;".repeat(4096)}}`;
    expect(validateMusicCss(declarations, 1).valid).toBe(true);
    expect(validateMusicCss(`.sj-title{${"top:0;".repeat(4097)}}`, 1).valid).toBe(false);
    const nested = (count: number) => "@media (min-width:1px){".repeat(count) + ".sj-title{color:red}" + "}".repeat(count);
    expect(validateMusicCss(nested(8), 1).valid).toBe(true);
    expect(validateMusicCss(nested(9), 1).valid).toBe(false);
  });

  it("rejects unknown contract versions", () => {
    expect(validateMusicCss("", 2).valid).toBe(false);
  });

  it("points to the unsafe value in a multiline draft", () => {
    const result = validateMusicCss(".sj-title {\n color: red;\n background: url(x);\n}", 1);
    expect(result).toMatchObject({ valid: false, errors: [{ line: 3, column: 14 }] });
  });

  it("namespaces keyframes and animation references independently per instance", () => {
    const source = "@keyframes fade { from { opacity: 0 } to { opacity: 1 } } .sj-title { animation: fade 2s ease, fade 1s linear; animation-name: fade; }";
    const first = compileMusicCss(source, 1, "one");
    const second = compileMusicCss(source, 1, "two");
    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    if (first.valid && second.valid) {
      expect(first.css).toContain("@keyframes sj-one-fade");
      expect(first.css).toContain("animation:sj-one-fade 2s ease,sj-one-fade 1s linear");
      expect(first.css).toContain("animation-name:sj-one-fade");
      expect(second.css).toContain("@keyframes sj-two-fade");
      expect(second.css).not.toContain("sj-one-fade");
    }
  });

  it("handles escaped and quoted keyframe names and nested container rules", () => {
    const result = compileMusicCss('@keyframes "pulse" { to { opacity: 1 } } @container (min-width:300px){.sj-title{animation-name:p\\75lse}} .sj-artists { animation-name: "pulse"; }', 1, "instance");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.css).toContain("@keyframes sj-instance-pulse");
      expect(result.css).toContain("animation-name:sj-instance-pulse");
      expect(result.css).toContain(".sj-artists{animation-name:sj-instance-pulse}");
    }
  });

  it("rejects invalid runtime CSS and instance identifiers", () => {
    expect(compileMusicCss(".sj-title{background:url(x)}", 1, "one").valid).toBe(false);
    expect(compileMusicCss(".sj-title{color:red}", 1, "bad id").valid).toBe(false);
  });
});
