import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ModuleOutputRequest,
  OverlayComposition,
  OverlayCompositionService,
  OverlayModuleDefinition,
  OverlayModuleRegistry,
  UnifiedOutputRequest
} from "@stream-jams/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServerApp, type ServerErrorLogEntry } from "../../app.js";
import { LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("web shell routes", () => {
  it("serves manifest-driven management shell assets and redirects root to /manage", async () => {
    const webBuildDirectory = await createWebBuildFixture();
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      webBuildDirectory
    });

    const root = await app.inject({
      method: "GET",
      url: "/"
    });
    const management = await app.inject({
      method: "GET",
      url: "/manage"
    });
    const script = await app.inject({
      method: "GET",
      url: "/assets/index-test.js"
    });
    const source = await app.inject({
      method: "GET",
      url: "/src/main.tsx"
    });

    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe("/manage");
    expect(management.statusCode).toBe(200);
    expect(management.headers["content-type"]).toContain("text/html");
    expect(management.body).toContain('<link rel="modulepreload" crossorigin href="/assets/vendor-test.js">');
    expect(management.body).toContain('<link rel="stylesheet" crossorigin href="/assets/index-test.css">');
    expect(management.body).toContain('<script type="module" crossorigin src="/assets/index-test.js"></script>');
    expect(management.body).not.toContain("/src/main.tsx");
    expect(script.statusCode).toBe(200);
    expect(script.body).toBe("console.log('built app');");
    expect(source.statusCode).toBe(404);
  });

  it("returns a safe error envelope and logs details when the web build is unavailable", async () => {
    const webBuildDirectory = await createTemporaryDirectory();
    const serverErrors: ServerErrorLogEntry[] = [];
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      webBuildDirectory,
      generateServerErrorId: () => "err_web_build",
      serverErrorLogger(entry) {
        serverErrors.push(entry);
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/manage"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "WEB_BUILD_UNAVAILABLE",
        id: "err_web_build",
        message: "Web build assets are unavailable. Run the production web build before opening Stream Jams."
      }
    });
    expect(serverErrors).toHaveLength(1);
    expect(serverErrors[0]).toMatchObject({
      code: "WEB_BUILD_UNAVAILABLE",
      errorId: "err_web_build",
      method: "GET",
      statusCode: 503,
      url: "/manage"
    });
  });

  it("serves management and overlay shells from the same manifest-driven local app fixture", async () => {
    const webBuildDirectory = await createWebBuildFixture();
    const overlayAccessService = createAccessService(["ovl_moduleLive"]);
    const created = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      webBuildDirectory,
      overlayAccessService,
      overlayCompositionService: new NoopOverlayCompositionService(),
      overlayModuleRegistry: createRegistry(["alerts"])
    });

    const management = await app.inject({
      method: "GET",
      url: "/manage"
    });
    const overlay = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${created.rawKey}`
    });

    expect(management.statusCode).toBe(200);
    expect(management.body).toContain('<script type="module" crossorigin src="/assets/index-test.js"></script>');
    expect(overlay.statusCode).toBe(200);
    expect(overlay.headers["content-type"]).toContain("text/html");
    expect(overlay.body).toContain('<script type="module" crossorigin src="/assets/index-test.js"></script>');
    expect(overlay.body).not.toContain("/src/main.tsx");
    expect(overlay.body).not.toContain(created.rawKey);
  });
});

async function createWebBuildFixture(): Promise<string> {
  const webBuildDirectory = await createTemporaryDirectory();
  await mkdir(join(webBuildDirectory, ".vite"), { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await writeFile(join(webBuildDirectory, "assets", "index-test.js"), "console.log('built app');", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "index-test.css"), "body { color: black; }", "utf8");
  await writeFile(join(webBuildDirectory, "assets", "vendor-test.js"), "export {};", "utf8");
  await writeFile(
    join(webBuildDirectory, ".vite", "manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/index-test.js",
        isEntry: true,
        css: ["assets/index-test.css"],
        imports: ["_vendor.js"]
      },
      "_vendor.js": {
        file: "assets/vendor-test.js"
      }
    }),
    "utf8"
  );

  return webBuildDirectory;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-web-shell-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createAccessService(rawKeys: readonly string[]): LocalOverlayAccessService {
  let rawKeyIndex = 0;
  let id = 0;
  return new LocalOverlayAccessService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => {
      id += 1;
      return `key-${id}`;
    },
    generateRawKey: () => {
      const rawKey = rawKeys[rawKeyIndex];
      rawKeyIndex += 1;
      if (rawKey === undefined) {
        throw new Error("Missing raw key fixture");
      }

      return rawKey;
    }
  });
}

function createRegistry(moduleIds: readonly string[]): Pick<OverlayModuleRegistry, "listModules"> {
  return {
    listModules() {
      return moduleIds.map(
        (id) =>
          ({
            id
          }) as OverlayModuleDefinition
      );
    }
  };
}

class NoopOverlayCompositionService implements OverlayCompositionService {
  async resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition> {
    return {
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "module",
      modules: []
    };
  }

  async resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition> {
    return {
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "unified",
      modules: []
    };
  }
}
