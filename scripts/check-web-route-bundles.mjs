import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const defaultBuildDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");
const defaultBudgets = {
  bootstrap: 100 * 1024,
  overlay: 150 * 1024,
  operator: 175 * 1024,
  management: 250 * 1024
};
const routeSources = {
  management: "src/App.tsx",
  operator: "src/operator/OperatorApp.tsx",
  overlay: "src/overlay/OverlayApp.tsx"
};

export async function checkWebRouteBundles({
  buildDirectory = defaultBuildDirectory,
  budgets = defaultBudgets
} = {}) {
  const manifest = await readManifest(buildDirectory);
  const bootstrapKey = findBootstrapKey(manifest);
  const bootstrapEntry = manifest[bootstrapKey];
  const routeKeys = Object.fromEntries(Object.entries(routeSources).map(([route, source]) => [
    route,
    findSourceKey(manifest, source)
  ]));
  for (const [route, routeKey] of Object.entries(routeKeys)) {
    if (!bootstrapEntry.dynamicImports?.includes(routeKey)) {
      throw new Error(`Bootstrap entry does not dynamically import the ${route} route ${routeKey}.`);
    }
  }

  const graphKeys = {
    bootstrap: collectStaticGraph(manifest, bootstrapKey),
    overlay: collectStaticGraph(manifest, routeKeys.overlay),
    operator: collectStaticGraph(manifest, routeKeys.operator),
    management: collectStaticGraph(manifest, routeKeys.management)
  };
  const routes = Object.fromEntries(await Promise.all(Object.entries(graphKeys).map(async ([route, keys]) => {
    const files = [...new Set([...keys]
      .map((key) => manifest[key].file)
      .filter((file) => file.endsWith(".js")))]
      .sort();
    const gzipBytes = (await Promise.all(files.map(async (file) => (
      gzipSync(await readFile(join(buildDirectory, file))).byteLength
    )))).reduce((total, size) => total + size, 0);
    return [route, { files, gzipBytes, sources: collectSources(manifest, keys) }];
  })));

  const errors = [];
  for (const [route, budget] of Object.entries(budgets)) {
    const measured = routes[route]?.gzipBytes;
    if (measured === undefined) throw new Error(`No ${route} route graph was measured.`);
    if (measured > budget) {
      errors.push(`${title(route)} graph ${formatBytes(measured)} exceeds its ${formatBytes(budget)} gzip budget.`);
    }
  }
  for (const source of routes.overlay.sources) {
    if (source === "src/App.tsx" || source.startsWith("src/management/")) {
      errors.push(`Overlay route includes management source ${source}.`);
    }
  }
  for (const source of routes.operator.sources) {
    if (source.includes("/alerts/editor/") || source.includes("/screen-effects/ScreenEffectEditor")) {
      errors.push(`Operator route includes editor source ${source}.`);
    }
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));

  return { routes };
}

export function formatWebRouteBundleReport(report) {
  return ["Web route bundle budgets (gzip):", ...["bootstrap", "overlay", "operator", "management"].map((route) => (
    `  ${route.padEnd(10)} ${formatBytes(report.routes[route].gzipBytes).padStart(10)} / ${formatBytes(defaultBudgets[route])}`
  ))].join("\n");
}

async function readManifest(buildDirectory) {
  const raw = await readFile(join(buildDirectory, ".vite", "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error("Web build manifest must be an object.");
  }
  for (const [key, candidate] of Object.entries(manifest)) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || typeof candidate.file !== "string") {
      throw new Error(`Web build manifest entry ${key} is invalid.`);
    }
  }
  return manifest;
}

function findBootstrapKey(manifest) {
  if (manifest["index.html"]?.isEntry === true) return "index.html";
  const entry = Object.entries(manifest).find(([, candidate]) => candidate.isEntry === true);
  if (entry === undefined) throw new Error("Web build manifest has no bootstrap entry.");
  return entry[0];
}

function findSourceKey(manifest, source) {
  const entry = Object.entries(manifest).find(([key, candidate]) => key === source || candidate.src === source);
  if (entry === undefined) throw new Error(`Web build manifest has no dynamic entry for ${source}.`);
  return entry[0];
}

function collectStaticGraph(manifest, startKey) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (entry === undefined) throw new Error(`Web build manifest import ${key} is missing.`);
    visited.add(key);
    for (const importedKey of entry.imports ?? []) visit(importedKey);
  };
  visit(startKey);
  return visited;
}

function collectSources(manifest, keys) {
  return [...new Set([...keys].flatMap((key) => {
    const source = manifest[key].src;
    return source === undefined ? [key] : [key, source];
  }))].sort();
}

function title(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(formatWebRouteBundleReport(await checkWebRouteBundles()));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}
