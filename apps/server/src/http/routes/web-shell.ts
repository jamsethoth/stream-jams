import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { HttpResponseError } from "../errors.js";

export interface WebShellRouteDependencies {
  readonly webBuildDirectory: string;
  readonly webShellRenderer?: WebShellRenderer;
}

export interface WebShellRenderer {
  renderManagementShell(): Promise<string>;
  renderOverlayShell(): Promise<string>;
}

interface ViteManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly src?: string;
  readonly css?: readonly string[];
  readonly imports?: readonly string[];
}

type ViteManifest = Record<string, ViteManifestEntry>;

const manifestRelativePath = ".vite/manifest.json";

export function registerWebShellRoutes(app: FastifyInstance, dependencies: WebShellRouteDependencies): WebShellRenderer {
  const renderer =
    dependencies.webShellRenderer ?? createViteManifestWebShellRenderer({ webBuildDirectory: dependencies.webBuildDirectory });
  const assetsDirectory = join(dependencies.webBuildDirectory, "assets");

  if (existsSync(assetsDirectory)) {
    app.register(fastifyStatic, {
      root: assetsDirectory,
      prefix: "/assets/",
      decorateReply: false
    });
  }

  app.get("/", async (_request, reply) => reply.redirect("/manage", 302));
  app.get("/legacy", async (_request, reply) => reply.redirect("/manage", 302));
  app.get("/legacy/*", async (_request, reply) => reply.redirect("/manage", 302));
  app.get("/manage", async (_request, reply) => sendHtml(reply, await renderer.renderManagementShell()));
  app.get("/manage/*", async (_request, reply) => sendHtml(reply, await renderer.renderManagementShell()));

  return renderer;
}

export function createViteManifestWebShellRenderer(input: { readonly webBuildDirectory: string }): WebShellRenderer {
  return new ViteManifestWebShellRenderer(input.webBuildDirectory);
}

export function sendHtml(reply: FastifyReply, html: string): FastifyReply {
  return reply.type("text/html; charset=utf-8").send(html);
}

class ViteManifestWebShellRenderer implements WebShellRenderer {
  constructor(private readonly webBuildDirectory: string) {}

  async renderManagementShell(): Promise<string> {
    return renderHtmlShell({
      title: "Stream Jams",
      bodyClass: "management-shell",
      assetTags: await this.renderAssetTags(),
      inlineStyle: null
    });
  }

  async renderOverlayShell(): Promise<string> {
    return renderHtmlShell({
      title: "Stream Jams Overlay",
      bodyClass: "overlay-shell",
      assetTags: await this.renderAssetTags(),
      inlineStyle: `html,
body,
#root {
  background: transparent;
  height: 100%;
  margin: 0;
  overflow: hidden;
  width: 100%;
}`
    });
  }

  private async renderAssetTags(): Promise<string> {
    const manifest = await readManifest(this.webBuildDirectory);
    const entry = findEntry(manifest);
    const importedChunks = collectImportedChunks(manifest, entry);
    const cssFiles = unique([...importedChunks.flatMap((chunk) => chunk.css ?? []), ...(entry.css ?? [])]);
    const preloadFiles = unique(importedChunks.map((chunk) => chunk.file));

    return [
      ...preloadFiles.map((file) => `<link rel="modulepreload" crossorigin href="${escapeAttribute(toPublicPath(file))}">`),
      ...cssFiles.map((file) => `<link rel="stylesheet" crossorigin href="${escapeAttribute(toPublicPath(file))}">`),
      `<script type="module" crossorigin src="${escapeAttribute(toPublicPath(entry.file))}"></script>`
    ].join("\n    ");
  }
}

async function readManifest(webBuildDirectory: string): Promise<ViteManifest> {
  const manifestPath = join(webBuildDirectory, manifestRelativePath);

  let rawManifest: string;
  try {
    rawManifest = await readFile(manifestPath, "utf8");
  } catch {
    throw new HttpResponseError(
      503,
      "WEB_BUILD_UNAVAILABLE",
      "Web build assets are unavailable. Run the production web build before opening Stream Jams."
    );
  }

  try {
    return parseManifest(JSON.parse(rawManifest) as unknown);
  } catch (error) {
    if (error instanceof HttpResponseError) {
      throw error;
    }

    throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest is invalid.");
  }
}

function parseManifest(candidate: unknown): ViteManifest {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest is invalid.");
  }

  const manifest: ViteManifest = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest is invalid.");
    }

    const entry = value as Record<string, unknown>;
    if (typeof entry.file !== "string") {
      throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest entry is invalid.");
    }

    manifest[key] = {
      file: entry.file,
      ...(entry.isEntry === undefined ? {} : { isEntry: entry.isEntry === true }),
      ...(typeof entry.src === "string" ? { src: entry.src } : {}),
      ...(Array.isArray(entry.css) ? { css: entry.css.filter(isString) } : {}),
      ...(Array.isArray(entry.imports) ? { imports: entry.imports.filter(isString) } : {})
    };
  }

  return manifest;
}

function findEntry(manifest: ViteManifest): ViteManifestEntry {
  const entry = manifest["index.html"] ?? Object.values(manifest).find((chunk) => chunk.isEntry === true);
  if (entry === undefined) {
    throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest does not include an entry.");
  }

  return entry;
}

function collectImportedChunks(
  manifest: ViteManifest,
  entry: ViteManifestEntry,
  visited: ReadonlySet<string> = new Set()
): readonly ViteManifestEntry[] {
  const importedKeys = entry.imports ?? [];
  const chunks: ViteManifestEntry[] = [];
  const nextVisited = new Set(visited);

  for (const key of importedKeys) {
    if (nextVisited.has(key)) {
      continue;
    }

    const chunk = manifest[key];
    if (chunk === undefined) {
      throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest import is missing.");
    }

    nextVisited.add(key);
    chunks.push(...collectImportedChunks(manifest, chunk, nextVisited), chunk);
  }

  return chunks;
}

function renderHtmlShell(input: {
  readonly title: string;
  readonly bodyClass: string;
  readonly assetTags: string;
  readonly inlineStyle: string | null;
}): string {
  const inlineStyle = input.inlineStyle === null ? "" : `\n    <style>\n${indent(input.inlineStyle, 6)}\n    </style>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(input.title)}</title>${inlineStyle}
    ${input.assetTags}
  </head>
  <body class="${escapeAttribute(input.bodyClass)}">
    <div id="root"></div>
  </body>
</html>`;
}

function toPublicPath(file: string): string {
  if (
    file.trim() === "" ||
    file.startsWith("/") ||
    file.includes("\\") ||
    file.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new HttpResponseError(503, "WEB_BUILD_MANIFEST_INVALID", "Web build manifest asset path is invalid.");
  }

  return `/${file}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll("\"", "&quot;");
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
