import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
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
  manifest["src/overlay/OverlayApp.tsx"].imports.push("src/management/leak.ts");
  manifest["src/management/leak.ts"] = {
    file: "assets/management-leak.js",
    src: "src/management/leak.ts"
  };
  const fixture = await createFixture(manifest);

  await assert.rejects(
    checkWebRouteBundles({ buildDirectory: fixture }),
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

async function createFixture(manifest) {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-route-bundles-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, ".vite"), { recursive: true });
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(join(directory, ".vite", "manifest.json"), JSON.stringify(manifest), "utf8");
  const files = new Set(Object.values(manifest).map((entry) => entry.file));
  await Promise.all([...files].map((file) => writeFile(join(directory, file), `export const value = ${JSON.stringify(file)};`, "utf8")));
  return directory;
}
