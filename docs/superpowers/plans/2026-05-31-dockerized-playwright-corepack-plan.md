# Dockerized Playwright And Corepack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stream Jams Playwright execution reliable on Ubuntu 26 hosts by running browsers through the official Playwright Docker image, and make package-manager setup use the project-pinned pnpm version through Corepack.

**Architecture:** Keep the Stream Jams workspace and test runner on the host, but run browser automation in a Playwright-supported Linux environment. Local Docker-backed execution starts a Playwright server inside `mcr.microsoft.com/playwright:v1.60.0-noble` with the documented remote-server shape: the server binds to `0.0.0.0` inside the container, Docker publishes that port only to host loopback, and browser pages reach the host Vite server through Docker's `hostmachine` host-gateway alias. GitHub Actions runs E2E tests inside the same official Playwright image. Corepack activates `pnpm@11.2.2` from the existing `packageManager` declaration.

**Tech Stack:** Node.js 24.16.0, Corepack, pnpm 11.2.2, Playwright 1.60.0, Docker, Vite, GitHub Actions.

---

## Source-Backed Decision Notes

- Playwright's Docker image is the right foundation for unsupported or inconsistent Linux browser environments. The image includes browser binaries and system dependencies, but the project still installs its own Playwright package through `pnpm install`.
- The local Docker helper should follow Playwright's remote-server guidance: publish the Playwright server port, run `playwright run-server --host 0.0.0.0`, and add `hostmachine:host-gateway` when browsers inside Docker need to access host-local servers.
- Publish the Playwright server as `127.0.0.1:<port>:<port>` instead of plain `<port>:<port>`. This preserves Playwright's container-facing `0.0.0.0` recommendation while keeping the browser RPC endpoint reachable only from the host loopback interface.
- Docker-backed local E2E requires the host Vite server to bind to `0.0.0.0` for that test run so browsers in the Playwright container can reach it through `http://hostmachine:4173`. Keep this as an explicit E2E-only environment override; the default remains `127.0.0.1`.
- Validate `PLAYWRIGHT_WEB_SERVER_HOST` with a strict allowlist before interpolating it into the Playwright `webServer.command`. This prevents shell-command injection while still allowing the Docker test mode to widen the bind address deliberately.
- GitHub Actions does not need a remote Playwright server because the full E2E job runs inside the Playwright container. The browser, Playwright test runner, and Vite test server all share the job container network.
- Node 24.16.0 supports the Corepack workflow used here. This repo is pinned to Node 24.16.0 through `.nvmrc`, `package.json#engines`, and `package.json#devEngines`; a future Node 25+ migration should re-check Corepack availability and setup.
- Removing `pnpm/action-setup` means the CI jobs should not keep `actions/setup-node`'s `cache: pnpm` input unless pnpm is activated before cache setup. This plan removes that cache input for correctness and keeps caching as a later optimization.
- Keep `@playwright/test` and the Docker image tag intentionally synced. If either version changes, update package metadata, lockfile, GitHub Actions image tags, README text, and the version check together.

Primary references:

- Playwright Docker docs: https://playwright.dev/docs/docker
- Playwright CI docs: https://playwright.dev/docs/ci
- Node Corepack docs for Node 24: https://nodejs.org/download/release/latest-v24.x/docs/api/corepack.html
- GitHub Actions workflow container docs: https://docs.github.com/actions/using-jobs/running-jobs-in-a-container

## Current Repository State

- `package.json` already declares `packageManager: "pnpm@11.2.2"`.
- `package.json` already declares `engines.node: "24.16.0"` and `engines.pnpm: "11.2.2"`.
- `.nvmrc` already declares `24.16.0`.
- `package.json` already declares `@playwright/test: "1.60.0"`.
- `package.json` already has `test:e2e: "playwright test"`.
- `playwright.config.ts` already runs tests from `tests/e2e` against Vite on `http://127.0.0.1:4173`.
- `.gitignore` already ignores `test-results/` and `playwright-report/`.
- `.github/workflows/ci.yml` currently uses `pnpm/action-setup@v6` and installs Playwright browsers directly on the runner.
- `README.md` currently describes the workspace build model but does not document Corepack setup or Docker-backed Playwright execution.

## Files To Modify

- Modify: `package.json`
- Modify: `playwright.config.ts`
- Create: `scripts/playwright-docker-server.mjs`
- Modify: `eslint.config.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

## Task 1: Add Root Package Scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the E2E report and Docker server scripts**

Update the root `scripts` object so it includes these entries while keeping the existing `test:e2e` script:

```json
{
  "dev": "pnpm --parallel --filter @stream-jams/server --filter @stream-jams/web dev",
  "build": "pnpm -r build",
  "test": "pnpm test:unit",
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "test:e2e:report": "playwright show-report",
  "playwright:docker-server": "node scripts/playwright-docker-server.mjs",
  "lint": "eslint .",
  "typecheck": "tsc -b tsconfig.json"
}
```

- [ ] **Step 2: Validate package JSON syntax**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')); console.log('package.json ok')"
```

Expected: exit code 0 and output `package.json ok`.

- [ ] **Step 3: Commit Task 1**

Run:

```bash
git add package.json
git commit -m "chore: add playwright helper scripts"
```

## Task 2: Make Playwright URLs And Bind Host Environment-Configurable

**Files:**

- Modify: `playwright.config.ts`

- [ ] **Step 1: Replace `playwright.config.ts` with environment-aware URLs and an allowlisted bind host**

Use this full file content:

```ts
import { defineConfig, devices } from "@playwright/test";

const defaultWebServerHost = "127.0.0.1";
const requestedWebServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? defaultWebServerHost;
const allowedWebServerHosts = new Set(["127.0.0.1", "0.0.0.0"]);

if (!allowedWebServerHosts.has(requestedWebServerHost)) {
  throw new Error("PLAYWRIGHT_WEB_SERVER_HOST must be either 127.0.0.1 or 0.0.0.0.");
}

const webServerHost = requestedWebServerHost;
const defaultWebServerUrl = "http://127.0.0.1:4173";
const webServerUrl = process.env.PLAYWRIGHT_WEB_SERVER_URL ?? defaultWebServerUrl;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? webServerUrl;
const viteAdditionalAllowedHostsKey = "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS";

function allowViteHost(host: string): void {
  const existingHosts = process.env[viteAdditionalAllowedHostsKey]
    ?.split(",")
    .map((allowedHost) => allowedHost.trim())
    .filter((allowedHost) => allowedHost.length > 0) ?? [];

  process.env[viteAdditionalAllowedHostsKey] = [...new Set([...existingHosts, host])].join(",");
}

try {
  const baseURLHost = new URL(baseURL).hostname;

  if (baseURLHost === "hostmachine") {
    allowViteHost(baseURLHost);
  }
} catch {
  // Let Playwright report invalid baseURL values with its normal config validation.
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `pnpm --filter @stream-jams/web exec vite --host ${webServerHost} --port 4173`,
    reuseExistingServer: !process.env.CI,
    url: webServerUrl
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
```

Why the values are separate:

- `PLAYWRIGHT_WEB_SERVER_HOST` controls the Vite bind address. Default `127.0.0.1` preserves Stream Jams' local-first default. Docker-backed E2E sets it to `0.0.0.0` for that test run only.
- `PLAYWRIGHT_WEB_SERVER_URL` is checked by the host-side Playwright test runner while it waits for Vite. It normally remains `http://127.0.0.1:4173`, even when Vite binds to `0.0.0.0`.
- `PLAYWRIGHT_BASE_URL` is used by browser pages. Docker-backed E2E sets it to `http://hostmachine:4173` because the browser process is inside the Playwright container.
- When `PLAYWRIGHT_BASE_URL` uses `hostmachine`, `playwright.config.ts` appends that exact host to Vite's `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` value so Vite keeps host checks enabled while accepting the Docker bridge hostname.

- [ ] **Step 2: Typecheck the config change**

Run:

```bash
corepack pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Validate invalid bind host rejection**

Run:

```bash
PLAYWRIGHT_WEB_SERVER_HOST='127.0.0.1; echo bad' corepack pnpm exec playwright test --list
```

Expected: exit code 1 and output containing `PLAYWRIGHT_WEB_SERVER_HOST must be either 127.0.0.1 or 0.0.0.0.` The command must not start Vite.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add playwright.config.ts
git commit -m "chore: make playwright network settings configurable"
```

## Task 3: Add Local Docker Playwright Server

**Files:**

- Create: `scripts/playwright-docker-server.mjs`
- Modify: `eslint.config.js`

- [ ] **Step 1: Create `scripts/playwright-docker-server.mjs`**

Use this full file content:

```js
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const playwrightPackage = require("@playwright/test/package.json");
const playwrightVersion = playwrightPackage.version;
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const requestedPort = process.env.PLAYWRIGHT_DOCKER_SERVER_PORT ?? "3000";
const portNumber = Number(requestedPort);

if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
  console.error("PLAYWRIGHT_DOCKER_SERVER_PORT must be a TCP port number.");
  process.exit(1);
}

const port = String(portNumber);
const endpoint = `ws://127.0.0.1:${port}/`;

const dockerArgs = [
  "run",
  "--rm",
  "--init",
  "--ipc=host",
  "--add-host=hostmachine:host-gateway",
  "-p",
  `127.0.0.1:${port}:${port}`,
  "--workdir",
  "/home/pwuser",
  "--user",
  "pwuser",
  image,
  "npx",
  "-y",
  `playwright@${playwrightVersion}`,
  "run-server",
  "--port",
  port,
  "--host",
  "0.0.0.0"
];

console.log(`Starting Playwright server with ${image} on ${endpoint}`);
console.log("Run tests in another terminal with:");
console.log(
  `PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=${endpoint} corepack pnpm test:e2e`
);

const child = spawn("docker", dockerArgs, {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`Docker Playwright server stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
```

Design notes:

- `--host 0.0.0.0` follows Playwright's remote-server Docker guidance.
- `-p 127.0.0.1:${port}:${port}` makes the Playwright RPC endpoint available to the host test runner without exposing it on the LAN.
- `--add-host=hostmachine:host-gateway` gives browsers inside the container a stable hostname for the host machine.
- The test command sets `PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0` so Vite binds for Docker bridge traffic, and `PLAYWRIGHT_BASE_URL=http://hostmachine:4173` so browser pages navigate to the host server correctly. The Playwright config then allows that exact `hostmachine` host through Vite's additional-host allowlist.

- [ ] **Step 2: Add scripts-specific ESLint globals**

Update `eslint.config.js` so `.mjs` helper scripts can use Node logging globals without inline disables. The resulting full file should be:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", ".agents/**", ".codex/**"]
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts", "playwright.config.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
```

- [ ] **Step 3: Validate the version-derived image string**

Run:

```bash
node -e "const version = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).devDependencies['@playwright/test']; const image = 'mcr.microsoft.com/playwright:v' + version + '-noble'; if (image !== 'mcr.microsoft.com/playwright:v1.60.0-noble') { throw new Error(image); } console.log(image)"
```

Expected: exit code 0 and output `mcr.microsoft.com/playwright:v1.60.0-noble`.

- [ ] **Step 4: Validate invalid port handling**

Run:

```bash
PLAYWRIGHT_DOCKER_SERVER_PORT=abc corepack pnpm playwright:docker-server
```

Expected: exit code 1 and output containing `PLAYWRIGHT_DOCKER_SERVER_PORT must be a TCP port number.` The command must not start Docker.

- [ ] **Step 5: Validate the Docker server manually on a local Docker host**

Run in terminal 1:

```bash
corepack pnpm playwright:docker-server
```

Expected: Docker starts `mcr.microsoft.com/playwright:v1.60.0-noble` and prints `ws://127.0.0.1:3000/`.

Run in terminal 2:

```bash
PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/ corepack pnpm test:e2e
```

Expected: Playwright tests execute through the Docker-hosted browser server. If Docker is unavailable in the current environment, record that the manual Docker validation was not run and continue with non-Docker validation.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add scripts/playwright-docker-server.mjs eslint.config.js
git commit -m "chore: add docker playwright server helper"
```

## Task 4: Switch CI Package-Manager Setup To Corepack

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update `validate` job setup**

In the `validate` job, remove the `Set up pnpm` step that uses `pnpm/action-setup@v6`.

Replace the Node setup with:

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v6
  with:
    node-version-file: .nvmrc

- name: Enable Corepack
  run: |
    corepack enable
    corepack prepare pnpm@11.2.2 --activate
    pnpm --version
```

Keep:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Lint
  run: pnpm lint

- name: Typecheck
  run: pnpm typecheck

- name: Test
  run: pnpm test
```

Remove these steps from `validate` because E2E moves to a dedicated Playwright container job:

```yaml
- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium

- name: E2E
  run: pnpm test:e2e
```

- [ ] **Step 2: Update `build` job setup**

In the `build` job, remove the `Set up pnpm` step that uses `pnpm/action-setup@v6`.

Replace the Node setup with:

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v6
  with:
    node-version-file: .nvmrc

- name: Enable Corepack
  run: |
    corepack enable
    corepack prepare pnpm@11.2.2 --activate
    pnpm --version
```

Keep:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Build
  run: pnpm build
```

- [ ] **Step 3: Verify no `pnpm/action-setup` or setup-node pnpm cache remains**

Run:

```bash
node -e "const workflow = require('node:fs').readFileSync('.github/workflows/ci.yml', 'utf8'); const matches = ['pnpm/action-setup', 'cache: pnpm'].filter((needle) => workflow.includes(needle)); if (matches.length > 0) { throw new Error('Unexpected workflow references: ' + matches.join(', ')); } console.log('workflow no longer uses pnpm/action-setup or setup-node pnpm cache')"
```

Expected: exit code 0 and output `workflow no longer uses pnpm/action-setup or setup-node pnpm cache`.

- [ ] **Step 4: Commit Task 4**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: use corepack for pnpm setup"
```

## Task 5: Add Dockerized GitHub Actions E2E Job

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a dedicated `e2e` job**

Add this job alongside `validate`, `build`, `codeql`, and `dependency-review`:

```yaml
  e2e:
    name: e2e
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    container:
      image: mcr.microsoft.com/playwright:v1.60.0-noble
      options: --ipc=host

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc

      - name: Enable Corepack
        run: |
          corepack enable
          corepack prepare pnpm@11.2.2 --activate
          pnpm --version

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Playwright tests
        run: pnpm test:e2e
        env:
          CI: true

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

- [ ] **Step 2: Validate package/image version sync**

Run:

```bash
node -e "const version = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).devDependencies['@playwright/test']; const workflow = require('node:fs').readFileSync('.github/workflows/ci.yml', 'utf8'); const expected = 'mcr.microsoft.com/playwright:v' + version + '-noble'; if (!workflow.includes(expected)) { throw new Error('Workflow does not include ' + expected); } console.log('playwright docker image matches package.json')"
```

Expected: exit code 0 and output `playwright docker image matches package.json`.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run playwright in docker image"
```

## Task 6: Document Corepack And Docker-Backed Playwright Usage

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add local tooling documentation**

Add this section after the opening project description and before `## Workspace Build Model`:

````markdown
## Local Tooling

Stream Jams pins its package manager with `packageManager: "pnpm@11.2.2"` in `package.json`. Use Corepack so local development, CI, and Docker-based workflows resolve the same pnpm version.

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
```
````

- [ ] **Step 2: Add Playwright E2E documentation**

Add this section after `## Workspace Build Model`:

````markdown
## Playwright E2E Tests

Run E2E tests directly on supported Playwright hosts with:

```bash
corepack pnpm test:e2e
```

On local operating systems where Playwright browser dependencies are unsupported or inconsistent, run browsers through the official Playwright Docker image instead. The Docker helper follows Playwright's remote-server model: the Playwright server binds to `0.0.0.0` inside the container, Docker publishes that port only to `127.0.0.1` on the host, and browser pages reach the host Vite server through `hostmachine`. When that Docker base URL is used, the Playwright config adds `hostmachine` to Vite's `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` allowlist rather than disabling host checks.

Terminal 1:

```bash
corepack pnpm playwright:docker-server
```

Terminal 2:

```bash
PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/ corepack pnpm test:e2e
```

`PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0` is only for Docker-backed local E2E execution. Normal local execution keeps the default `127.0.0.1` Vite bind address.

The Docker helper derives the image tag from the installed `@playwright/test` version and currently uses `mcr.microsoft.com/playwright:v1.60.0-noble`. When upgrading Playwright, update `@playwright/test`, `pnpm-lock.yaml`, the GitHub Actions image tag, and related documentation together.
````

- [ ] **Step 3: Commit Task 6**

Run:

```bash
git add README.md
git commit -m "docs: document corepack and docker playwright"
```

## Final Validation

- [ ] **Step 1: Run non-Docker validation**

Run:

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: each command exits with code 0.

- [ ] **Step 2: Run direct Playwright validation where supported**

Run:

```bash
corepack pnpm test:e2e
```

Expected on supported Playwright hosts: exit code 0. On hosts where Playwright browser dependency installation is unsupported or inconsistent, use the Docker server validation as the authoritative local E2E path.

- [ ] **Step 3: Run Docker-backed Playwright validation on a local Docker host**

Run in terminal 1:

```bash
corepack pnpm playwright:docker-server
```

Run in terminal 2:

```bash
PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/ corepack pnpm test:e2e
```

Expected: exit code 0. If Docker is unavailable, record the blocker in the PR validation notes.

- [ ] **Step 4: Review CI workflow diff**

Run:

```bash
git diff -- .github/workflows/ci.yml
```

Confirm:

- `validate` runs install, lint, typecheck, and unit tests only.
- `build` runs install and build only.
- `e2e` runs in `mcr.microsoft.com/playwright:v1.60.0-noble`.
- `pnpm/action-setup` is removed.
- `actions/setup-node` uses `.nvmrc`.
- GitHub Actions permissions remain least-privilege.

## Acceptance Criteria

- CI uses Corepack to activate `pnpm@11.2.2`.
- CI no longer depends on `pnpm/action-setup`.
- `actions/setup-node` reads Node from `.nvmrc`.
- Playwright E2E tests run in a dedicated GitHub Actions job inside `mcr.microsoft.com/playwright:v1.60.0-noble`.
- Local Docker-backed E2E starts a Playwright server with `--host 0.0.0.0` inside the container and publishes the server port only to `127.0.0.1` on the host.
- Local Docker-backed E2E uses `hostmachine:host-gateway` plus `PLAYWRIGHT_BASE_URL=http://hostmachine:4173` so containerized browsers can reach the host Vite server.
- Local Docker-backed E2E allows the exact `hostmachine` Vite host through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` without disabling Vite host checks.
- `PLAYWRIGHT_WEB_SERVER_HOST` is allowlisted to `127.0.0.1` and `0.0.0.0` before it is interpolated into the web server command.
- Normal local execution retains the default `127.0.0.1` Vite bind address.
- `playwright.config.ts` supports environment-specific web server bind host, web server URL, and browser base URL while retaining current default local behavior.
- README documents Corepack setup and the Docker-backed Playwright workflow.
- The Playwright package version and Docker image tag stay intentionally synced.
- The implementation is committed in reviewable task commits or a single clean PR commit, depending on the execution workflow chosen by the user.
