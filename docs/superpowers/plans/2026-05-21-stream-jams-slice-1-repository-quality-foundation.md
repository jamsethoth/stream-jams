# Stream Jams Slice 1 Repository And Quality Foundation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Break Slice 1 from `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` into small, independently achievable, testable sub-slices that leave the repository with a strict runnable TypeScript workspace, a React/Vite web shell, a Node/Fastify server shell, and working quality gates.

**Status:** Complete. Implementation verified at branch commit `9eda2a5`.

**Architecture:** This plan creates only the repository and quality foundation. It establishes package boundaries for `apps/server`, `apps/web`, `packages/core`, and `packages/test-support`, with strict TypeScript and test scaffolding, but it intentionally avoids domain models, persistence, auth, overlay routing, provider integrations, and real product workflows.

**Tech Stack:** pnpm workspaces, TypeScript strict mode, React, Vite, Fastify, Vitest, Testing Library, ESLint, Playwright placeholder script, and Node.js ESM.

---

## Source Plan Reference

This plan decomposes **Slice 1: Repository And Quality Foundation** from `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`.

Original Slice 1 value:

- Establish a runnable mandatory TypeScript workspace.
- Include React/Vite web packages.
- Include Node/Fastify server packages.
- Include fast feedback standards.

Original Slice 1 acceptance checks:

- `pnpm install` completes.
- `pnpm install --frozen-lockfile` completes after the lockfile has been intentionally updated for dependency changes.
- All direct dependencies and dev dependencies are pinned to exact versions with no semver ranges, and `pnpm-lock.yaml` is committed with transitive dependency integrity data.
- `pnpm test` passes with sample tests.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- TypeScript strict mode is enabled for all packages.
- The scaffold uses React/Vite for web UI code and Node/Fastify for server code.
- No app logic exists outside the intended packages.

## Scope Boundaries

### In Scope

- Root workspace metadata and scripts.
- Strict TypeScript configuration shared by all packages.
- Package-local TypeScript configuration.
- A minimal `packages/core` export used only to prove package wiring.
- A minimal `packages/test-support` export used only to prove test helper wiring.
- A minimal Fastify app factory with `GET /health`.
- A minimal React/Vite management shell with one component.
- Vitest tests for core, server, and web.
- ESLint configuration and lint script.
- Placeholder `test:e2e` script that communicates Playwright is not configured yet.
- `.gitignore` entries for Node, Vite, build, coverage, and local files.
- Exact dependency versions in every `package.json`.
- Frozen-lockfile verification so builds cannot resolve newer dependency versions without a repo change.

### Out Of Scope

- Core domain types and Zod schemas; those belong to Slice 2.
- Config persistence, port collision handling, or runtime config endpoints; those belong to Slice 5.
- Secrets, sessions, route keys, or auth; those belong to Slices 3 and 6.
- Overlay module registry or composition; those belong to Slice 7.
- SQLite, migrations, and repositories; those belong to Slice 8.
- Asset import, alert rules, playback queue, WebSocket transport, Twitch, TTS, diagnostics, and Electron packaging.

### Non-Negotiable Constraints

- Keep every sub-slice independently testable.
- Keep the repository runnable after each sub-slice.
- Do not introduce product-domain behavior in Slice 1.
- Use TypeScript strict mode for every package.
- Use dependency injection for the server app factory from the first server sub-slice.
- Keep browser UI code free of Node-only imports.
- Do not use semver ranges such as `^`, `~`, `>`, or `*` for direct dependencies or dev dependencies.
- Treat dependency updates as explicit source changes: update package manifests and `pnpm-lock.yaml` together.

## Target File Structure

```text
.
  .gitignore
  eslint.config.js
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
  apps/
    server/
      package.json
      tsconfig.json
      src/
        app.ts
        expect-never.test.ts
        index.ts
        app.test.ts
    web/
      index.html
      package.json
      tsconfig.json
      vite.config.ts
      src/
        App.tsx
        App.test.tsx
        main.tsx
        test-setup.ts
  packages/
    core/
      package.json
      tsconfig.json
      src/
        index.ts
        version.ts
        version.test.ts
    test-support/
      package.json
      tsconfig.json
      src/
        index.ts
```

## Sub-Slice 1.1: Root Workspace Baseline

**Purpose:** Create the pnpm monorepo skeleton, strict shared TypeScript config, lint config, ignore rules, and root scripts.

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create directories: `apps/server`, `apps/web`, `packages/core`, `packages/test-support`

**Scoped Boundary:** This sub-slice creates root-level tooling only. It must not create package source files except empty directories.

- [x] **Step 1: Create root workspace metadata**

Create `package.json`:

```json
{
  "name": "stream-jams",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "pnpm --parallel --filter @stream-jams/server --filter @stream-jams/web dev",
    "build": "pnpm -r build",
    "test": "pnpm test:unit",
    "test:unit": "vitest run",
    "test:e2e": "node -e \"console.log('Playwright e2e tests are introduced in a later slice.')\"",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@eslint/js": "9.18.0",
    "@types/node": "22.10.7",
    "eslint": "9.18.0",
    "typescript": "5.7.3",
    "typescript-eslint": "8.20.0",
    "vitest": "2.1.8"
  }
}
```

- [x] **Step 2: Create workspace package globs**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [x] **Step 3: Create strict shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [x] **Step 4: Create lint configuration**

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "coverage", "node_modules"]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
```

- [x] **Step 5: Create ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.vite/
.turbo/
.DS_Store
*.log
.env
.env.*
!.env.example
```

- [x] **Step 6: Verify root package metadata**

Run:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm lint
pnpm test:e2e
```

Expected:

- `pnpm install` creates `pnpm-lock.yaml`.
- `pnpm install --frozen-lockfile` succeeds after the lockfile is created.
- `pnpm lint` succeeds with no source files.
- `pnpm test:e2e` prints the placeholder Playwright message and exits with status 0.

- [x] **Step 7: Commit Sub-Slice 1.1**

```bash
git add .gitignore eslint.config.js package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
git commit -m "chore: add workspace foundation"
```

## Sub-Slice 1.2: Core Package Baseline

**Purpose:** Add `packages/core` with a minimal export and unit test to prove shared package compilation and Vitest discovery.

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/version.ts`
- Create: `packages/core/src/version.test.ts`
- Create: `vitest.config.ts`

**Scoped Boundary:** This sub-slice may define only scaffold-level helpers. It must not introduce Stream Jams domain models.

- [x] **Step 1: Create the core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@stream-jams/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --emitDeclarationOnly false",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  }
}
```

- [x] **Step 2: Create core TypeScript config**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": false,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

- [x] **Step 3: Add a scaffold version helper**

Create `packages/core/src/version.ts`:

```ts
export interface AppVersion {
  readonly name: "stream-jams";
  readonly version: string;
}

export function createAppVersion(version = "0.0.0"): AppVersion {
  return {
    name: "stream-jams",
    version
  };
}
```

- [x] **Step 4: Export the helper**

Create `packages/core/src/index.ts`:

```ts
export type { AppVersion } from "./version.js";
export { createAppVersion } from "./version.js";
```

- [x] **Step 5: Add the core unit test**

Create `packages/core/src/version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAppVersion } from "./version.js";

describe("createAppVersion", () => {
  it("returns the Stream Jams app name and supplied version", () => {
    expect(createAppVersion("1.2.3")).toEqual({
      name: "stream-jams",
      version: "1.2.3"
    });
  });
});
```

- [x] **Step 6: Add root Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
```

- [x] **Step 7: Verify core sub-slice**

Run:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @stream-jams/core typecheck
pnpm --filter @stream-jams/core build
```

Expected:

- One core test passes.
- `pnpm install` updates `pnpm-lock.yaml` only for the newly added workspace package.
- `pnpm install --frozen-lockfile` proves the committed lockfile is sufficient.
- Core typecheck passes.
- Core build emits `packages/core/dist`.

- [x] **Step 8: Commit Sub-Slice 1.2**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts packages/core
git commit -m "chore: add core package baseline"
```

## Sub-Slice 1.3: Server Package Baseline

**Purpose:** Add `apps/server` with a dependency-injected Fastify app factory and a health test that does not bind a production port.

**Files:**

- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/app.test.ts`
- Create: `apps/server/src/index.ts`

**Scoped Boundary:** This sub-slice may add only `GET /health`. It must not add configurable ports, config persistence, startup collision handling, management APIs, overlay routes, or auth.

- [x] **Step 1: Create server package manifest**

Create `apps/server/package.json`:

```json
{
  "name": "@stream-jams/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "fastify": "5.2.1"
  },
  "devDependencies": {
    "tsx": "4.19.2",
    "typescript": "5.7.3"
  }
}
```

- [x] **Step 2: Create server TypeScript config**

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": false,
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

- [x] **Step 3: Add dependency-injected Fastify app factory**

Create `apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";

export interface ServerAppDependencies {
  readonly appName: "stream-jams";
  readonly version: string;
}

export function createServerApp(
  dependencies: ServerAppDependencies = { appName: "stream-jams", version: "0.0.0" }
): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  app.get("/health", async () => ({
    status: "ok" as const,
    app: dependencies.appName,
    version: dependencies.version
  }));

  return app;
}
```

- [x] **Step 4: Add server health test**

Create `apps/server/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createServerApp } from "./app.js";

describe("createServerApp", () => {
  it("returns health without binding a production port", async () => {
    const app = createServerApp({
      appName: "stream-jams",
      version: "1.2.3"
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      app: "stream-jams",
      version: "1.2.3"
    });
  });
});
```

- [x] **Step 5: Add minimal local server entry point**

Create `apps/server/src/index.ts`:

```ts
import { createServerApp } from "./app.js";

const app = createServerApp();
const port = 39187;
const host = "127.0.0.1";

try {
  await app.listen({ host, port });
  app.log.info(`Stream Jams server listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
```

- [x] **Step 6: Verify server sub-slice**

Run:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @stream-jams/server typecheck
pnpm --filter @stream-jams/server build
```

Expected:

- Core and server tests pass.
- `pnpm install` updates `pnpm-lock.yaml` for the exact Fastify and tsx versions.
- `pnpm install --frozen-lockfile` proves the committed lockfile is sufficient.
- Server typecheck passes.
- Server build emits `apps/server/dist`.

- [x] **Step 7: Commit Sub-Slice 1.3**

```bash
git add package.json pnpm-lock.yaml apps/server packages/core
git commit -m "chore: add server package baseline"
```

## Sub-Slice 1.4: Web Package Baseline

**Purpose:** Add `apps/web` with a minimal React/Vite shell and a component test.

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/test-setup.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Scoped Boundary:** This sub-slice may add only a minimal management shell placeholder. It must not add navigation, API clients, overlay rendering, module screens, alert workflows, or real management UI.

- [x] **Step 1: Create web package manifest**

Create `apps/web/package.json`:

```json
{
  "name": "@stream-jams/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "4.3.4",
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.1.0",
    "@testing-library/user-event": "14.5.2",
    "@types/react": "19.0.7",
    "@types/react-dom": "19.0.3",
    "jsdom": "25.0.1",
    "typescript": "5.7.3"
  }
}
```

- [x] **Step 2: Create web TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "outDir": "dist"
  },
  "include": ["src", "vite.config.ts"]
}
```

- [x] **Step 3: Create Vite config with test environment**

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"]
  }
});
```

- [x] **Step 4: Create app HTML entry**

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Stream Jams</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [x] **Step 5: Add minimal React shell**

Create `apps/web/src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Stream Jams</h1>
      <p>Local-first stream overlay management shell.</p>
    </main>
  );
}
```

- [x] **Step 6: Add browser entry point**

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [x] **Step 7: Add test setup**

Create `apps/web/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [x] **Step 8: Add web component test**

Create `apps/web/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the management shell name", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Stream Jams"
      })
    ).toBeInTheDocument();
  });
});
```

- [x] **Step 9: Add root jsdom support for the shared Vitest runner**

Modify root `package.json`:

```json
{
  "name": "stream-jams",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "pnpm --parallel --filter @stream-jams/server --filter @stream-jams/web dev",
    "build": "pnpm -r build",
    "test": "pnpm test:unit",
    "test:unit": "vitest run",
    "test:e2e": "node -e \"console.log('Playwright e2e tests are introduced in a later slice.')\"",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@eslint/js": "9.18.0",
    "@types/node": "22.10.7",
    "eslint": "9.18.0",
    "jsdom": "25.0.1",
    "typescript": "5.7.3",
    "typescript-eslint": "8.20.0",
    "vitest": "2.1.8"
  }
}
```

- [x] **Step 10: Update root Vitest config for React component tests**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [["apps/web/**/*.test.tsx", "jsdom"]],
    setupFiles: ["apps/web/src/test-setup.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
```

- [x] **Step 11: Verify web sub-slice**

Run:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @stream-jams/web typecheck
pnpm --filter @stream-jams/web build
```

Expected:

- Core, server, and web tests pass.
- `pnpm install` updates `pnpm-lock.yaml` for the exact React, Vite, Testing Library, and jsdom versions.
- `pnpm install --frozen-lockfile` proves the committed lockfile is sufficient.
- Web typecheck passes.
- Web build emits `apps/web/dist`.

- [x] **Step 12: Commit Sub-Slice 1.4**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts apps/web
git commit -m "chore: add web package baseline"
```

## Sub-Slice 1.5: Test Support Package Baseline

**Purpose:** Add `packages/test-support` as the future home for shared test helpers, with one harmless helper used by a test.

**Files:**

- Create: `packages/test-support/package.json`
- Create: `packages/test-support/tsconfig.json`
- Create: `packages/test-support/src/expect-never.test.ts`
- Create: `packages/test-support/src/index.ts`

**Scoped Boundary:** This sub-slice may add only generic test helper utilities. It must not add provider mocks, database fixtures, browser fixtures, or domain-specific builders.

- [x] **Step 1: Create test-support package manifest**

Create `packages/test-support/package.json`:

```json
{
  "name": "@stream-jams/test-support",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  }
}
```

- [x] **Step 2: Create test-support TypeScript config**

Create `packages/test-support/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": false,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

- [x] **Step 3: Add a generic test helper**

Create `packages/test-support/src/index.ts`:

```ts
export function expectNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
```

- [x] **Step 4: Add a test for the helper**

Create `packages/test-support/src/expect-never.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expectNever } from "./index.js";

describe("expectNever", () => {
  it("throws when called from an exhaustive branch", () => {
    expect(() => expectNever("unexpected" as never)).toThrow(
      "Unexpected value: unexpected"
    );
  });
});
```

- [x] **Step 5: Verify test-support sub-slice**

Run:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @stream-jams/test-support typecheck
pnpm --filter @stream-jams/test-support build
```

Expected:

- All tests pass.
- `pnpm install` updates `pnpm-lock.yaml` only for the newly added workspace package.
- `pnpm install --frozen-lockfile` proves the committed lockfile is sufficient.
- Test support typecheck passes.
- Test support build emits `packages/test-support/dist`.

- [x] **Step 6: Commit Sub-Slice 1.5**

```bash
git add package.json pnpm-lock.yaml packages/test-support
git commit -m "chore: add test support package baseline"
```

## Sub-Slice 1.6: Unified Quality Gates

**Purpose:** Verify the full Slice 1 foundation works through root scripts and clean up any script or config mismatch.

**Files:**

- Modify only if needed: `package.json`
- Modify only if needed: `vitest.config.ts`
- Modify only if needed: package-level `tsconfig.json` files
- Modify only if needed: package-level `package.json` files

**Scoped Boundary:** This sub-slice is validation and cleanup only. It must not add new product behavior or new packages.

- [x] **Step 1: Run full Slice 1 verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected:

- `pnpm install --frozen-lockfile` completes.
- `pnpm lint` passes.
- `pnpm typecheck` passes for every workspace package.
- `pnpm test` passes core, server, and web tests.
- `pnpm test:e2e` exits 0 with the placeholder message.
- `pnpm build` passes for every workspace package.

- [x] **Step 2: Confirm no accidental out-of-scope files exist**

Run:

```bash
find apps packages -type f | sort
```

Expected files are limited to:

```text
apps/server/package.json
apps/server/src/app.test.ts
apps/server/src/app.ts
apps/server/src/index.ts
apps/server/tsconfig.json
apps/web/index.html
apps/web/package.json
apps/web/src/App.test.tsx
apps/web/src/App.tsx
apps/web/src/main.tsx
apps/web/src/test-setup.ts
apps/web/tsconfig.json
apps/web/vite.config.ts
packages/core/package.json
packages/core/src/index.ts
packages/core/src/version.test.ts
packages/core/src/version.ts
packages/core/tsconfig.json
packages/test-support/package.json
packages/test-support/src/expect-never.test.ts
packages/test-support/src/index.ts
packages/test-support/tsconfig.json
```

- [x] **Step 3: Confirm dependency versions are exact**

Run:

```bash
rg -n '":\s*"[~^>*]' package.json apps packages -g package.json
```

Expected:

- No matches.

- [x] **Step 4: Confirm no Slice 2+ behavior was introduced**

Run:

```bash
rg -n "zod|sqlite|overlay|twitch|tts|auth|session|secret|ConfigStore|AlertRule|NormalizedStreamEvent" apps packages
```

Expected:

- No matches, except harmless occurrences in package names or comments if a worker added explanatory text.
- If matches include implementation code, remove that code from Slice 1.

- [x] **Step 5: Commit final Slice 1 verification**

If Step 1 required fixes:

```bash
git add package.json pnpm-lock.yaml vitest.config.ts apps packages
git commit -m "chore: verify repository quality foundation"
```

If Step 1 required no fixes, do not create an empty commit.

## Final Slice 1 Acceptance Checklist

- [x] `pnpm install --frozen-lockfile` completes.
- [x] `pnpm lint` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.
- [x] `pnpm test:e2e` exits successfully with a placeholder message.
- [x] `pnpm build` passes.
- [x] `packages/core` builds and has one unit test.
- [x] `apps/server` builds and has one Fastify `GET /health` injection test.
- [x] `apps/web` builds and has one React component test.
- [x] `packages/test-support` builds and is usable by tests.
- [x] TypeScript strict mode is inherited by all packages.
- [x] No app logic exists outside `apps/*` and `packages/*`.
- [x] No Slice 2+ domain, persistence, auth, overlay, provider, or diagnostics behavior exists.

## Completion Evidence

Fresh verification on `codex/slice-1-features` confirmed:

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm test:e2e`
- `corepack pnpm build`
- Package-specific builds for `@stream-jams/core`, `@stream-jams/server`, `@stream-jams/web`, and `@stream-jams/test-support`
- Source file-list check against `apps` and `packages`
- Exact dependency version scan with no semver range matches
- Slice 2+ scope scan with no domain, persistence, auth, overlay, provider, or diagnostics matches

No Slice 1 functionality gaps were identified.

## Execution Notes For Agentic Workers

- Complete one sub-slice at a time.
- Run the verification commands listed in the active sub-slice before committing.
- If dependency versions need patch-level adjustment, keep the same technology choices and explain the adjustment in the final message.
- If `pnpm install` or `pnpm install --frozen-lockfile` needs network access in Codex, request escalation rather than replacing dependencies by hand.
- If an existing user change appears in the working tree, do not revert it. Work around it or ask for guidance if it blocks the active sub-slice.
- The final Slice 1 state should be boring: a strict, tested scaffold that future slices can safely build on.
