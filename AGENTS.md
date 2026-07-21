# Stream Jams Repository Instructions

## Product And Architecture

- Stream Jams is a local-first streaming overlay app. The MVP serves a React management UI, browser-source overlays, HTTP API, assets, and WebSockets from a local Node/Fastify service bound to `127.0.0.1` by default.
- Browser-source URLs are the only MVP output. OBS WebSocket, native OBS plugins, LAN mode, cloud sync, Docker delivery, and packaged Electron delivery remain deferred unless an approved change says otherwise.
- Monorepo boundaries:
  - `apps/server`: Fastify HTTP/WebSocket service and runtime composition.
  - `apps/web`: React/Vite management and overlay UIs.
  - `packages/core`: framework-independent contracts, schemas, and business logic.
  - `packages/test-support`: shared test helpers.
- Package manifests, lockfile, TypeScript configs, and OpenSpec artifacts are authoritative for current versions and implemented scope; do not duplicate version facts here.

## Context Routing

- Product scope: `docs/product-plan.md`.
- Canonical backlog: `docs/backlog.md`. Add new deferred work there first, link detailed rationale instead of duplicating status, attach an OpenSpec change when promoted, and remove the backlog row after implementation and spec sync complete.
- MVP architecture and slice guidance: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, `docs/superpowers/stream-jams-mvp-slice-autonomy-prompt.md`, and the relevant slice plan under `docs/superpowers/plans/`.
- Frontend/UX source of truth: `docs/ai/frontend-agent-guide.md`; follow its routing to the UX spec, UI guidelines, design tokens, and overlay error rules.
- Use `.agents/skills/stream-jams-frontend-change` for frontend implementation and `.agents/skills/stream-jams-frontend-review` for frontend review.
- Read only context relevant to the requested area. Global instructions own OpenSpec, CodeGraph, GitHub auth, workspace, token, and subagent policy.

## Engineering Invariants

### TypeScript And Workspace

- Keep strict TypeScript, project references, ESM, and package boundaries. Do not weaken `strict`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.
- In NodeNext code, use explicit `.js` relative imports, `import type` for type-only imports, and `node:` specifiers for built-ins.
- Use pnpm workspaces and `workspace:` internal dependencies. Keep exact direct versions and lockfile in sync; do not add dependencies without a concrete need.

### Server, Persistence, And Security

- Keep Fastify handlers thin; business rules belong in framework-independent services. Validate all HTTP, WebSocket, provider, config, persistence, and future IPC input at the boundary.
- Access SQLite only through typed repository interfaces. Enable foreign keys per connection, use narrow transactions for multi-row changes, and include WAL companion files in backup/copy behavior when WAL is enabled.
- Keep management and overlay authorization separate. Overlay keys must be unguessable and purpose-scoped, must never authorize management APIs, and must be redacted from logs and exports.
- Keep local binding at `127.0.0.1` unless an approved change introduces the security model required for LAN access.
- Overlay WebSocket clients must handle open/message/error/close, bounded reconnect, cleanup, idempotency where required, and no unbounded buffering.

### Frontend And Overlay

- Keep React render pure and follow Hooks rules. Components orchestrate UI state through typed client boundaries; matching, normalization, auth, persistence, queueing, and overlay composition stay outside React.
- Keep management and overlay clients browser-compatible. Filesystem, SQLite, keyring, Electron, and other Node-only APIs stay behind server or future IPC boundaries.
- Render normalized playback instructions, never raw provider payloads. Production overlays fail closed and transparent; actionable diagnostics belong in management UI or logs.
- Never put secrets in Vite env, browser bundles, Storybook args, screenshots, logs, docs examples, or copied overlay URLs; client-visible config is public.
- Changed production UI needs proportional Storybook coverage and the gates routed by `docs/ai/frontend-agent-guide.md`. Use tiny assets from `apps/web/public/storybook-assets/`.

### Verification

- Vitest does not replace typechecking. Use Fastify `inject()` where a real port is unnecessary; prefer Testing Library role/label queries and user-event; use Playwright for browser-visible workflows.
- Do not weaken, skip, or delete tests to make validation pass. Change tests only when behavior intentionally changes.
- Before publishing, run relevant repo gates: lint, typecheck, tests, build, Storybook gates, and Playwright when applicable.
- After code changes, rebuild and restart affected local services, wait for health, reload the UI, and verify the changed live workflow against the new build.

## Slice Workflow

- Process one independently reviewable slice at a time.
- Before implementation, fetch current remote state, confirm branch/worktree and target scope, verify the slice is still unimplemented, and branch from `origin/main`.
- Keep a committed slice-specific implementation spec before or with implementation. Follow the matching OpenSpec workflow when `openspec/` is present.
- Keep changes scoped; include positive, negative, edge, and failure tests. Add or update Playwright coverage for user-visible browser behavior.
- Before PR creation, reconcile requirements against code/tests, close in-scope gaps, run required gates, and verify the rebuilt live workflow.
