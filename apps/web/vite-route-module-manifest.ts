import { relative } from "node:path";
import type { Plugin } from "vite";

export const routeModuleManifestFile = ".vite/route-modules.json";

export function routeModuleManifestPlugin(): Plugin {
  let projectRoot = process.cwd();
  let enabled = false;

  return {
    name: "stream-jams-route-module-manifest",
    configResolved(config) {
      projectRoot = config.root;
      enabled = config.build.manifest === true;
    },
    generateBundle(_options, bundle) {
      if (!enabled) return;
      const chunks = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .sort((left, right) => left.fileName.localeCompare(right.fileName));
      const moduleManifest = Object.fromEntries(chunks.map((chunk) => [
        chunk.fileName,
        Object.keys(chunk.modules)
          .map((moduleId) => normalizeModuleId(projectRoot, moduleId))
          .sort()
      ]));

      this.emitFile({
        type: "asset",
        fileName: routeModuleManifestFile,
        source: `${JSON.stringify(moduleManifest, null, 2)}\n`
      });
    }
  };
}

function normalizeModuleId(projectRoot: string, moduleId: string): string {
  const withoutQuery = moduleId.split("?", 1)[0] ?? moduleId;
  if (withoutQuery.startsWith("\0")) return withoutQuery;
  return relative(projectRoot, withoutQuery).replaceAll("\\", "/");
}
