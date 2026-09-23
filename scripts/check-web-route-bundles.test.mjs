import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { pathToFileURL, URL } from "node:url";
import { routeModuleManifestPlugin } from "../apps/web/vite-route-module-manifest.ts";
import { checkWebRouteBundles } from "./check-web-route-bundles.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("measures the bootstrap and three dynamic route graphs with shared chunks counted once", async () => {
  const fixture = await createFixture(validManifest());

  const report = await checkWebRouteBundles({ buildDirectory: fixture });

  assert.deepEqual(report.routes.overlay.files, ["assets/bootstrap.js", "assets/overlay.js", "assets/shared.js"]);
  assert.deepEqual(report.routes.operator.files, ["assets/bootstrap.js", "assets/operator.js", "assets/shared.js"]);
  assert.deepEqual(report.routes.management.files, ["assets/bootstrap.js", "assets/management.js", "assets/shared.js"]);
  assert.ok(report.routes.bootstrap.gzipBytes > 0);
});

test("rejects a management source imported by the overlay graph", async () => {
  const manifest = validManifest();
  const moduleManifest = validModuleManifest(manifest);
  moduleManifest["assets/overlay.js"].push("src/management/leak.ts");
  const fixture = await createFixture(manifest, moduleManifest);

  await assert.rejects(
    checkWebRouteBundles({ buildDirectory: fixture }),
    /Overlay route includes management source src\/management\/leak\.ts/u
  );
});

test("rejects a folded management import from a real Vite overlay chunk", async () => {
  const project = await createViteFixture();
  const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);

  await build({
    root: project,
    logLevel: "silent",
    plugins: [routeModuleManifestPlugin()],
    build: { manifest: true, outDir: "dist" }
  });
  const moduleManifest = await readFile(join(project, "dist", ".vite", "route-modules.json"), "utf8");
  assert.match(moduleManifest, /src\/management\/leak\.ts/u, moduleManifest);

  await assert.rejects(
    checkWebRouteBundles({ buildDirectory: join(project, "dist") }),
    /Overlay route includes management source src\/management\/leak\.ts/u
  );
});

test("rejects a route graph above its gzip budget", async () => {
  const fixture = await createFixture(validManifest());

  await assert.rejects(
    checkWebRouteBundles({
      buildDirectory: fixture,
      budgets: { bootstrap: 0, overlay: 1_000, operator: 1_000, management: 1_000 }
    }),
    /Bootstrap graph .* exceeds its 0 B gzip budget/u
  );
});

function validManifest() {
  return {
    "index.html": {
      file: "assets/bootstrap.js",
      src: "index.html",
      isEntry: true,
      dynamicImports: [
        "src/App.tsx",
        "src/operator/OperatorApp.tsx",
        "src/overlay/OverlayApp.tsx"
      ]
    },
    "src/App.tsx": {
      file: "assets/management.js",
      src: "src/App.tsx",
      isDynamicEntry: true,
      imports: ["index.html", "_shared.js"]
    },
    "src/operator/OperatorApp.tsx": {
      file: "assets/operator.js",
      src: "src/operator/OperatorApp.tsx",
      isDynamicEntry: true,
      imports: ["index.html", "_shared.js"]
    },
    "src/overlay/OverlayApp.tsx": {
      file: "assets/overlay.js",
      src: "src/overlay/OverlayApp.tsx",
      isDynamicEntry: true,
      imports: ["index.html", "_shared.js"]
    },
    "_shared.js": {
      file: "assets/shared.js"
    }
  };
}

async function createFixture(manifest, moduleManifest = validModuleManifest(manifest)) {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-route-bundles-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, ".vite"), { recursive: true });
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(join(directory, ".vite", "manifest.json"), JSON.stringify(manifest), "utf8");
  await writeFile(join(directory, ".vite", "route-modules.json"), JSON.stringify(moduleManifest), "utf8");
  const files = new Set(Object.values(manifest).map((entry) => entry.file));
  await Promise.all([...files].map((file) => writeFile(join(directory, file), `export const value = ${JSON.stringify(file)};`, "utf8")));
  return directory;
}

function validModuleManifest(manifest) {
  return Object.fromEntries(Object.entries(manifest).map(([key, entry]) => [
    entry.file,
    [entry.src ?? key]
  ]));
}

async function createViteFixture() {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-vite-route-bundles-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "src", "management"), { recursive: true });
  await mkdir(join(directory, "src", "operator"), { recursive: true });
  await mkdir(join(directory, "src", "overlay"), { recursive: true });
  await writeFile(join(directory, "index.html"), '<script type="module" src="/src/main.ts"></script>', "utf8");
  await writeFile(join(directory, "src", "main.ts"), [
    'void import("./App.tsx");',
    'void import("./operator/OperatorApp.tsx");',
    'void import("./overlay/OverlayApp.tsx");'
  ].join("\n"), "utf8");
  await writeFile(join(directory, "src", "App.tsx"), "export const management = true;", "utf8");
  await writeFile(join(directory, "src", "operator", "OperatorApp.tsx"), "export const operator = true;", "utf8");
  await writeFile(join(directory, "src", "management", "leak.ts"), [
    'console.log("management leak loaded");',
    "export const leak = true;"
  ].join("\n"), "utf8");
  await writeFile(join(directory, "src", "overlay", "OverlayApp.tsx"), [
    'import { leak } from "../management/leak.ts";',
    "console.log(leak);",
    "export const overlay = leak;"
  ].join("\n"), "utf8");
  return directory;
}
