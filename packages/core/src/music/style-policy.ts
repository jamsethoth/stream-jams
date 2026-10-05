import * as css from "css-tree";
import { musicLimits } from "./schemas.js";

export type MusicCssValidationResult =
  | { readonly valid: true; readonly css: string }
  | { readonly valid: false; readonly errors: readonly { readonly line: number; readonly column: number; readonly message: string }[] };

const parts = new Set([
  "sj-content", "sj-artwork", "sj-title", "sj-artists", "sj-album", "sj-progress-track", "sj-progress-fill", "sj-time", "sj-brand-image"
]);
const attributes: Record<string, ReadonlySet<string>> = {
  "data-view": new Set(["full", "compact"]),
  "data-theme": new Set(["dark", "light"]),
  "data-playback-state": new Set(["playing", "paused", "stopped", "unknown"])
};
const functions = new Set([
  "calc", "min", "max", "clamp", "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch",
  "color", "color-mix", "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient",
  "repeating-radial-gradient", "repeating-conic-gradient", "cubic-bezier", "steps", "minmax", "repeat", "fit-content",
  "translate", "translatex", "translatey", "translate3d", "scale", "scalex", "scaley", "rotate", "rotatex", "rotatey",
  "skew", "skewx", "skewy", "matrix", "matrix3d", "blur", "brightness", "contrast", "grayscale", "hue-rotate",
  "invert", "opacity", "saturate", "sepia", "drop-shadow", "var"
]);
const animationKeywords = new Set([
  "none", "initial", "inherit", "unset", "revert", "revert-layer", "linear", "ease", "ease-in", "ease-out",
  "ease-in-out", "step-start", "step-end", "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused", "auto", "start", "end",
  "jump-start", "jump-end", "jump-none", "jump-both"
]);
const atRules = new Set(["media", "supports", "container", "keyframes"]);
const prohibitedProperties = new Set(["behavior", "-moz-binding", "src", "unicode-range", "pointer-events"]);
/** Renderer-owned, color-only values on the inner content root. */
export const musicCssNativeVariables = [
  "--sj-title-color", "--sj-details-color", "--sj-progress-fill-color", "--sj-progress-track-color",
  "--sj-artwork-placeholder-color", "--sj-border-color"
] as const;
const nativeVariables = new Set<string>(musicCssNativeVariables);

class PolicyError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) { super(message); }
}

function reject(node: css.CssNode, message: string): never {
  throw new PolicyError(message, node.loc?.start.line ?? 1, node.loc?.start.column ?? 1);
}

function decoded(name: string): string { return css.ident.decode(name); }

function validateSelector(prelude: css.Rule["prelude"]): void {
  if (prelude.type !== "SelectorList") reject(prelude, "Selector cannot be parsed safely");
  for (const selector of prelude.children) {
    if (selector.type !== "Selector") reject(selector, "Unsupported selector");
    let currentClass: string | null = null;
    let completed = false;
    for (const node of selector.children) {
      switch (node.type) {
        case "ClassSelector": {
          const name = decoded(node.name);
          if (!parts.has(name) || currentClass !== null || completed) reject(node, "Only documented Music parts may be selected");
          currentClass = name;
          break;
        }
        case "AttributeSelector": {
          const name = decoded(node.name.name);
          const value = node.value?.type === "Identifier" ? decoded(node.value.name) : node.value?.type === "String" ? css.string.decode(node.value.value) : null;
          if (currentClass !== "sj-content" || !attributes[name]?.has(value ?? "") || node.matcher !== "=" || node.flags) {
            reject(node, "Only documented attributes on .sj-content may be selected");
          }
          break;
        }
        case "Combinator":
          if (!currentClass || completed) reject(node, "Selector must start with a documented Music part");
          currentClass = null;
          break;
        case "PseudoElementSelector":
          if (!currentClass || completed || node.children || !["before", "after"].includes(decoded(node.name).toLowerCase())) reject(node, "Unsupported pseudo-element");
          completed = true;
          break;
        default:
          reject(node, "Host, global, slot and undocumented selectors are unavailable");
      }
    }
    if (!currentClass) reject(selector, "Selector must end with a documented Music part");
  }
}

function validateValue(value: css.Declaration["value"], references: Map<string, css.FunctionNode[]>): void {
  if (value.type === "Raw") reject(value, "Unparsed CSS value is unsupported");
  css.walk(value, node => {
    if (node.type === "Raw" || node.type === "Url") reject(node, "Unparsed or resource-loading CSS is unsupported");
    if (node.type === "String" && (/[<>]/.test(css.string.decode(node.value)) || /javascript\s*:/i.test(css.string.decode(node.value)))) {
      reject(node, "HTML or JavaScript text is unsupported in Music CSS");
    }
    if (node.type !== "Function") return;
    const name = decoded(node.name).toLowerCase();
    if (!functions.has(name)) reject(node, `Unsupported CSS function ${name}`);
    if (name === "var") {
      const args = node.children.toArray();
      if (args.length !== 1 || args[0]?.type !== "Identifier") reject(node, "var() must name one locally declared custom property without a fallback");
      const name = decoded(args[0].name);
      if (!name.startsWith("--")) reject(node, "Invalid custom property reference");
      references.set(name, [...(references.get(name) ?? []), node]);
    }
  });
}

function validateDeclaration(node: css.Declaration, references: Map<string, css.FunctionNode[]>, locals: Map<string, css.Declaration>): void {
  const property = decoded(node.property);
  const lower = property.toLowerCase();
  if (prohibitedProperties.has(lower) || lower.startsWith("-moz-") || lower.startsWith("-ms-") || lower.startsWith("-webkit-")) {
    reject(node, `Property ${property} is unsupported`);
  }
  if (property.startsWith("--")) {
    if (!/^--[A-Za-z][A-Za-z0-9-]*$/.test(property)) reject(node, "Invalid custom property name");
    if (nativeVariables.has(property)) reject(node, "Renderer-owned native variables cannot be redefined in custom CSS");
    locals.set(property, node);
  } else if (!css.lexer.getProperty(lower)) {
    reject(node, `Unknown CSS property ${property}`);
  }
  const localReferences = new Map<string, css.FunctionNode[]>();
  validateValue(node.value, localReferences);
  for (const [name, uses] of localReferences) references.set(name, [...(references.get(name) ?? []), ...uses]);
  if (!property.startsWith("--") && localReferences.size === 0) {
    const match = css.lexer.matchProperty(lower, node.value);
    if (!match.matched) reject(node, `Invalid value for ${property}`);
  }
}

function validatePrelude(prelude: css.AtrulePrelude): void {
  css.walk(prelude, node => {
    if (["Raw", "Url", "GeneralEnclosed", "FeatureFunction", "Selector", "SelectorList", "PseudoClassSelector", "PseudoElementSelector"].includes(node.type)) {
      reject(node, "Unsupported or unparsed at-rule condition");
    }
    if (node.type === "Function") reject(node, "Functions in at-rule conditions are unsupported");
    if (node.type === "SupportsDeclaration") {
      const references = new Map<string, css.FunctionNode[]>();
      validateDeclaration(node.declaration, references, new Map());
      if (references.size) reject(node, "Variables in @supports conditions are unsupported");
    }
  });
}

function validateBlock(block: css.Block, kind: "style" | "group" | "keyframes", depth: number, counts: { rules: number; declarations: number }, names: Map<string, css.Atrule>): void {
  if (depth > musicLimits.cssNesting) reject(block, "CSS nesting exceeds eight levels");
  const locals = new Map<string, css.Declaration>();
  const references = new Map<string, css.FunctionNode[]>();
  const declarations: css.Declaration[] = [];
  for (const child of block.children) {
    if (child.type === "Declaration") {
      if (kind !== "style") reject(child, "Declarations require a style or keyframe step rule");
      counts.declarations++;
      if (counts.declarations > musicLimits.cssDeclarations) reject(child, "CSS exceeds 4,096 declarations");
      declarations.push(child);
      validateDeclaration(child, references, locals);
    } else if (child.type === "Rule" || child.type === "Atrule") {
      if (kind === "style" || (kind === "keyframes" && child.type === "Atrule")) reject(child, "Nested style rules or keyframe at-rules are unsupported");
      validateStatement(child, kind === "keyframes", depth, counts, names);
    } else reject(child, "Unsupported CSS syntax");
  }
  // A custom property must be defined in this exact rule. Inherited values and
  // cross-selector cascade cannot be proven safe at this boundary.
  for (const [name, uses] of references) if (!locals.has(name) && !nativeVariables.has(name)) reject(uses[0]!, `Variable ${name} is not locally declared`);
  const dependencies = new Map<string, Set<string>>();
  for (const [name, declaration] of locals) {
    const refs = new Map<string, css.FunctionNode[]>();
    validateValue(declaration.value, refs);
    dependencies.set(name, new Set(refs.keys()));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) reject(locals.get(name)!, "Cyclic custom properties are unsupported");
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of dependencies.get(name) ?? []) if (!nativeVariables.has(dependency)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of locals.keys()) visit(name);
  for (const declaration of declarations) {
    const property = decoded(declaration.property).toLowerCase();
    if ((property === "animation" || property === "animation-name") && declaration.value.type === "Value") {
      css.walk(declaration.value, node => { if (node.type === "Function" && decoded(node.name).toLowerCase() === "var") reject(node, "Animation variables cannot be namespaced safely"); });
    }
  }
}

function validateStatement(node: css.CssNode, keyframes: boolean, depth: number, counts: { rules: number; declarations: number }, names: Map<string, css.Atrule>): void {
  if (node.type === "Rule") {
    counts.rules++;
    if (counts.rules > musicLimits.cssRules) reject(node, "CSS exceeds 512 rules");
    if (keyframes) {
      if (node.prelude.type !== "SelectorList") reject(node.prelude, "Unparsed keyframe selector");
      for (const selector of node.prelude.children) {
        const tokens = css.generate(selector).split(",");
        for (const token of tokens) {
          const name = token.trim().toLowerCase();
          if (name !== "from" && name !== "to" && (!/^\d+(?:\.\d+)?%$/.test(name) || Number(name.slice(0, -1)) > 100)) {
            reject(selector, "Keyframes require from, to, or a percentage from 0 to 100");
          }
        }
      }
    } else validateSelector(node.prelude);
    validateBlock(node.block, "style", depth, counts, names);
    return;
  }
  if (node.type !== "Atrule") reject(node, "Unsupported CSS syntax");
  const name = decoded(node.name).toLowerCase();
  if (!atRules.has(name) || !node.block || !node.prelude || node.prelude.type !== "AtrulePrelude") reject(node, `Unsupported @${name} rule`);
  if (keyframes) reject(node, "At-rules inside keyframes are unsupported");
  if (name === "keyframes") {
    const values = node.prelude.children.toArray();
    if (values.length !== 1 || (values[0]?.type !== "Identifier" && values[0]?.type !== "String")) reject(node.prelude, "Keyframes require one name");
    const first = values[0]!;
    const key = first.type === "String" ? css.string.decode(first.value) : decoded(first.name);
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || animationKeywords.has(key.toLowerCase()) || names.has(key)) reject(first, "Invalid or duplicate keyframe name");
    names.set(key, node);
    validateBlock(node.block, "keyframes", depth + 1, counts, names);
  } else {
    validatePrelude(node.prelude);
    validateBlock(node.block, "group", depth + 1, counts, names);
  }
}

function parseAndValidate(source: string, styleContractVersion: number): { ast: css.StyleSheet; names: Map<string, css.Atrule> } {
  if (styleContractVersion !== 1) throw new PolicyError("Unsupported Music style contract version", 1, 1);
  if (new TextEncoder().encode(source).byteLength > musicLimits.cssBytes) throw new PolicyError("CSS exceeds 32 KiB UTF-8", 1, 1);
  const ast = css.parse(source, {
    positions: true, parseCustomProperty: true,
    onParseError(error) { throw new PolicyError(error.message, error.line, error.column); }
  });
  if (ast.type !== "StyleSheet") reject(ast, "Expected a CSS stylesheet");
  const counts = { rules: 0, declarations: 0 };
  const names = new Map<string, css.Atrule>();
  for (const node of ast.children) validateStatement(node, false, 0, counts, names);
  css.walk(ast, node => {
    if (node.type === "Raw") reject(node, "Unparsed CSS syntax is unsupported");
    if (node.type === "String" && (/[<>]/.test(css.string.decode(node.value)) || /javascript\s*:/i.test(css.string.decode(node.value)))) {
      reject(node, "HTML or JavaScript text is unsupported in Music CSS");
    }
  });
  // Check animation identifiers after all keyframe definitions have been seen.
  css.walk(ast, node => {
    if (node.type !== "Declaration") return;
    const property = decoded(node.property).toLowerCase();
    if ((property !== "animation" && property !== "animation-name") || node.value.type !== "Value") return;
    css.walk(node.value, part => {
      if (part.type !== "Identifier" && part.type !== "String") return;
      const value = part.type === "String" ? css.string.decode(part.value) : decoded(part.name);
      if (!names.has(value) && !animationKeywords.has(value.toLowerCase())) reject(part, `Unknown animation name ${value}`);
    });
  });
  return { ast, names };
}

function failure(error: unknown): MusicCssValidationResult {
  if (error instanceof PolicyError) return { valid: false, errors: [{ line: error.line, column: error.column, message: error.message }] };
  if (error instanceof SyntaxError && "line" in error && "column" in error) {
    return { valid: false, errors: [{ line: Number(error.line), column: Number(error.column), message: error.message }] };
  }
  throw error;
}

export function validateMusicCss(source: string, styleContractVersion: number): MusicCssValidationResult {
  try { return { valid: true, css: css.generate(parseAndValidate(source, styleContractVersion).ast) }; }
  catch (error) { return failure(error); }
}

export function compileMusicCss(source: string, styleContractVersion: number, instanceId: string): MusicCssValidationResult {
  try {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(instanceId)) throw new PolicyError("Invalid Music widget instance ID", 1, 1);
    const { ast, names } = parseAndValidate(source, styleContractVersion);
    const replacements = new Map([...names.keys()].map(name => [name, `sj-${instanceId}-${name}`]));
    for (const [name, rule] of names) {
      if (rule.prelude?.type !== "AtrulePrelude") reject(rule, "Missing keyframe name");
      rule.prelude.children.clear();
      rule.prelude.children.push({ type: "Identifier", name: replacements.get(name)! });
    }
    css.walk(ast, node => {
      if (node.type !== "Declaration") return;
      const property = decoded(node.property).toLowerCase();
      if ((property !== "animation" && property !== "animation-name") || node.value.type !== "Value") return;
      css.walk(node.value, (part, item, list) => {
        if (part.type === "Identifier") {
          const replacement = replacements.get(decoded(part.name));
          if (replacement) part.name = replacement;
        } else if (part.type === "String") {
          const replacement = replacements.get(css.string.decode(part.value));
          if (replacement) list.replace(item, css.List.createItem({ type: "Identifier", name: replacement }));
        }
      });
    });
    return { valid: true, css: css.generate(ast) };
  } catch (error) { return failure(error); }
}
