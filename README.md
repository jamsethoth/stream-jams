# Stream Jams

Stream Jams is a local-first streaming overlay application for configurable stream alerts. It is intended to run on a streamer's machine and expose a browser-source URL that can be added to OBS, Streamlabs Desktop, XSplit, vMix, or similar streaming software.

The initial scope focuses on Twitch alerts with configurable visual media, audio, text, TTS, alert collections, and a fullscreen modular overlay canvas.

See [docs/product-plan.md](docs/product-plan.md) for the current product plan, MVP scope, security requirements, assumptions, and open implementation questions.

## Workspace Build Model

Stream Jams uses pnpm workspaces for package management and workspace script orchestration. TypeScript package relationships are modeled with project references through the root `tsconfig.json`, so shared packages such as `@stream-jams/core` are built and typechecked before dependent apps such as `@stream-jams/server`.

The current build model intentionally stays simple:

- pnpm owns workspace dependency installation and recursive package script execution.
- TypeScript project references own TypeScript compile/typecheck ordering.
- Vite owns the browser app bundle after the web TypeScript project check passes.

Turborepo is a possible future addition if the workspace grows enough to need task-graph caching, affected-package execution, or faster CI feedback. It is not part of the MVP toolchain yet.
