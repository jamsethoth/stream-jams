# Stream Jams

Stream Jams is a local-first streaming overlay application for configurable stream alerts. It is intended to run on a streamer's machine and expose a browser-source URL that can be added to OBS, Streamlabs Desktop, XSplit, vMix, or similar streaming software.

The initial scope focuses on Twitch alerts with configurable visual media, audio, text, TTS, alert collections, and a fullscreen modular overlay canvas.

See [docs/product-plan.md](docs/product-plan.md) for the current product plan, MVP scope, security requirements, assumptions, and open implementation questions.

## Local Tooling

Stream Jams pins its package manager with `packageManager: "pnpm@11.2.2"` in `package.json`. Use Corepack so local development, CI, and Docker-based workflows resolve the same pnpm version.

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
```

## Workspace Build Model

Stream Jams uses pnpm workspaces for package management and workspace script orchestration. TypeScript package relationships are modeled with project references through the root `tsconfig.json`, so shared packages such as `@stream-jams/core` are built and typechecked before dependent apps such as `@stream-jams/server`.

The current build model intentionally stays simple:

- pnpm owns workspace dependency installation and recursive package script execution.
- TypeScript project references own TypeScript compile/typecheck ordering.
- Vite owns the browser app bundle after the web TypeScript project check passes.

Turborepo is a possible future addition if the workspace grows enough to need task-graph caching, affected-package execution, or faster CI feedback. It is not part of the MVP toolchain yet.

## Playwright E2E Tests

Run E2E tests directly on supported Playwright hosts with:

```bash
corepack pnpm test:e2e
```

On local operating systems where Playwright browser dependencies are unsupported or inconsistent, run browsers through the official Playwright Docker image instead. The Docker helper follows Playwright's remote-server model: the Playwright server binds to `0.0.0.0` inside the container, Docker publishes that port only to `127.0.0.1` on the host, and browser pages reach the host Vite server through `hostmachine`.

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
