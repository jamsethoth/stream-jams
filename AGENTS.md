# GitHub CLI in Codex

In this environment, GitHub CLI auth is stored in the OS keyring and is not reliably visible inside the Codex sandbox.

For any `gh` command that needs GitHub auth or network access, use escalated execution first. This includes `gh auth status`, `gh auth token`, `gh repo ...`, `gh pr ...`, `gh issue ...`, and `gh api ...`.

Do not ask me to re-authenticate based only on non-escalated `gh` output. First verify with escalated `gh auth status`.

Do not use `gh auth refresh --insecure-storage` unless I explicitly request it.

# Repository Defaults

When creating a new local project or repository and the user does not provide a parent directory, create it under `/mnt/c/dev/projects`.

When initializing a new Git repository, use `main` as the initial branch name instead of `master`.

When creating a new GitHub repository, make it public by default unless I explicitly ask for a private repository.

When creating a new public repository, include the GNU Affero General Public License v3.0 by default unless I explicitly request a different license. Add the standard AGPLv3 license text as `LICENSE` and use the SPDX identifier `AGPL-3.0-or-later` where project metadata supports SPDX license identifiers.

# Cross-Platform Checkout And Writeback Defaults

For new repositories and repository configuration updates, explicitly account for Windows, macOS, and Linux local execution when filesystem behavior is in scope.

- Add a repository `.gitattributes` file that normalizes text files with `* text=auto eol=lf`, unless the project has a stronger existing line-ending policy.
- Add a repository `.editorconfig` file that sets `charset = utf-8`, `end_of_line = lf`, and `insert_final_newline = true` for text files, unless an equivalent policy already exists.
- Mark binary file families as binary in `.gitattributes` when they are present or expected, including common image, archive, font, and PDF extensions.
- When code writes text files, use explicit UTF-8 encoding and stable line-feed terminators instead of relying on platform defaults.
- When code builds filesystem paths, use platform-aware path APIs instead of hard-coded separators, and test Windows and POSIX path semantics when the behavior must work across local operating systems.

# GitHub Repository Protection Defaults

For new GitHub repositories:

- Use `main` as the default branch.
- Prefer creating the GitHub repository as public from the start; public repositories can use branch protection and repository security features that may be unavailable to private repositories without GitHub Pro.
- After creating or changing repository visibility, verify the remote repository state before applying protection rules.
- Protect `main` before feature work begins.
- Require pull requests before merging to `main`.
- Require at least one approving review when reviewers are available.
- For solo-maintainer repositories, allow administrators to bypass the approval requirement so the owner is not blocked by the lack of another contributor.
- Dismiss stale approvals when new commits are pushed.
- Require approval of the most recent reviewable push when reviewers are available.
- Require conversation resolution before merge.
- Require CI/status checks once a validation workflow exists.
- Do not allow force pushes or branch deletion on `main`.
- Set GitHub Actions default token permissions to read-only.
- Elevate workflow permissions only per job when required.
- Enable Dependabot alerts, Dependabot security updates, dependency graph, secret scanning, push protection, and CodeQL where available.

Implementation notes learned from `jamsethoth/stream-jams`:

- Always verify escalated `gh auth status` before attempting repository settings calls. If the OS keyring is locked, settings calls can fail with HTTP 401 even if a previous connector action worked.
- Do not assume GitHub branch protection is available on private personal repositories. If GitHub returns that branch protection requires GitHub Pro or a public repository, report that blocker and ask whether the repository should be made public.
- Do not programmatically make a private repository public unless explicitly requested after the disclosure risk is understood.
- For personal repositories, branch protection payloads must not include organization-only user/team restriction objects. Use `restrictions: null` and omit `bypass_pull_request_allowances` unless GitHub accepts it for that repository type.
- To allow solo-maintainer admin bypass, set branch protection with admin enforcement disabled while still requiring pull requests and one approving review for non-admin merges.
- Apply Dependabot vulnerability alerts before enabling Dependabot security updates; GitHub rejects security updates until alerts are enabled.
- Secret scanning and push protection may require a public repository or an eligible plan. Verify the final `security_and_analysis` response because some optional subfeatures, such as non-provider patterns or validity checks, may remain unavailable.
- After applying settings, verify branch protection, Actions workflow permissions, vulnerability alerts, repository visibility, and security analysis settings with fresh GitHub API reads.

# Stream Jams Project Context

Stream Jams is a local-first streaming overlay application. The MVP runs a local Node/Fastify service that serves a React/Vite management UI, browser-source overlay UI, HTTP API, static assets, and WebSocket endpoints from `127.0.0.1` by default. Browser-source URLs are the only MVP output model; OBS WebSocket, native OBS plugins, LAN overlay mode, cloud sync, Docker delivery, and packaged Electron delivery are deferred.

The selected architecture is a TypeScript full-stack monorepo:

- `apps/server`: Node.js, Fastify, TypeScript, local HTTP/WebSocket service.
- `apps/web`: React, Vite, TypeScript, management UI and overlay UI.
- `packages/core`: framework-independent domain types, schemas, service contracts, and pure business logic.
- `packages/test-support`: shared test helpers.
- Future desktop shell: Electron, after the local MVP stabilizes.

The locked stack from the MVP and tech-stack plans is Node.js `24.16.0`, pnpm `11.2.2`, TypeScript `6.0.3`, React `19.2.6`, Vite `8.0.14`, Fastify `5.8.5`, Zod `4.4.3`, ESLint `10.4.0`, Vitest `4.1.7`, Testing Library, Playwright, SQLite behind typed repository interfaces, WebSocket transport, and Electron for eventual packaging.

When planning or implementing slices, review the relevant source docs first:

- `docs/product-plan.md`
- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/stream-jams-mvp-slice-autonomy-prompt.md`
- Any slice-specific plan under `docs/superpowers/plans/`

# Source-Backed Stack Practices

Use these rules when implementing the Stream Jams stack. The links are primary or official project documentation.

## TypeScript, Node.js, and pnpm

- Keep TypeScript strict across all packages. The root config already enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; do not weaken those flags. TypeScript documents `strict` as enabling stronger correctness checks, and project references as improving build speed and enforcing logical boundaries: https://www.typescriptlang.org/tsconfig#strict and https://www.typescriptlang.org/docs/handbook/project-references
- Preserve TypeScript project references. Shared packages must build before dependents via `tsc -b`; keep each package `composite` and avoid import cycles between workspace packages.
- This repo is ESM-first with `"type": "module"`. In NodeNext server/core code, use explicit `.js` extensions in relative TypeScript imports so emitted JavaScript follows Node's ESM rules: https://nodejs.org/download/release/latest-v24.x/docs/api/esm.html
- Use `import type` for type-only imports. Node's TypeScript docs explain that type stripping needs the `type` keyword to avoid treating type imports as runtime value imports: https://nodejs.org/dist/latest/docs/api/typescript.html
- Use `node:` specifiers for built-in Node modules and `node:path` / `node:url` APIs for cross-platform paths.
- Use pnpm workspaces from the repo root. Internal dependencies should use `workspace:` so pnpm refuses to resolve them from the registry accidentally: https://pnpm.io/workspaces
- Keep exact dependency versions and the committed lockfile in sync. CI and release validation should install with frozen lockfile behavior; pnpm documents that CI fails when the lockfile is out of sync and `--frozen-lockfile` does not update `pnpm-lock.yaml`: https://pnpm.io/cli/install
- Do not add dependencies unless the slice spec or PR explains why the existing stack cannot reasonably handle the need.

## Backend: Fastify, Validation, Security, and WebSocket

- Keep Fastify route handlers thin. Put business rules in framework-independent services and call them from handlers.
- Register related routes, hooks, and decorators as Fastify plugins or route modules with explicit dependencies. Fastify's encapsulation model scopes decorators, hooks, and plugins to descendants and helps avoid cross-dependency issues: https://fastify.dev/docs/v5.7.x/Reference/Encapsulation/ and https://fastify.dev/docs/v5.7.x/Reference/Plugins/
- Validate all untrusted data at boundaries: HTTP bodies/query/params, WebSocket messages, provider payloads, config files, persistence rows, and IPC once Electron exists. Fastify supports route schemas for validation and serialization, and Zod supports `.safeParse()` for non-throwing validation flows: https://fastify.dev/docs/v5.7.x/Reference/Validation-and-Serialization/ and https://zod.dev/basics
- Prefer Zod schemas in `packages/core` when TypeScript types and runtime validators should stay paired. Use JSON Schema where Fastify route schema compilation or protocol documentation makes that the better boundary contract.
- Keep management authorization separate from overlay authorization. Overlay route keys must be unguessable, scoped by purpose, never grant management API access, and be redacted from logs.
- Bind local services to `127.0.0.1` by default. Treat LAN binding as a future security-model change, not a small config toggle.
- For browser overlay WebSocket clients, handle `open`, `message`, `error`, and `close`, and design reconnect behavior. MDN notes that the WebSocket API has no backpressure, so handlers must avoid unbounded message buffering: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- For Twitch EventSub WebSocket ingestion, implement keepalive/reconnect handling and idempotency. Twitch says clients should reconnect and resubscribe after missing keepalive/notification beyond `keepalive_timeout_seconds`, and notifications may be delivered more than once with the same message ID: https://dev.twitch.tv/docs/eventsub/handling-websocket-events and https://dev.twitch.tv/docs/eventsub/websocket-reference/

## Persistence: SQLite

- Access SQLite only through typed repository interfaces. Do not leak SQL rows, driver objects, or migration details into HTTP handlers, React code, or provider adapters.
- Enable foreign key enforcement for every SQLite connection. SQLite documents that foreign keys must be enabled per connection and applications should not depend on the default: https://www.sqlite.org/foreignkeys.html
- Use explicit transactions for multi-row or multi-table changes, and keep transaction scope narrow.
- If WAL mode is enabled, account for the `-wal` and `-shm` files in backup/export/copy logic. SQLite documents that WAL commits are appended to a separate WAL file and that separating a database from its WAL can lose committed transactions or corrupt the copy: https://www.sqlite.org/wal.html
- Keep migrations deterministic and reversible where practical. Validate migrated rows through the same domain schemas used by repositories.

## Frontend: React and Vite

- Keep React components pure during render. React expects components to return the same JSX for the same inputs and to avoid mutating preexisting objects during rendering: https://react.dev/learn/keeping-components-pure
- Follow the Rules of Hooks. Do not call hooks conditionally, in loops, after early returns, in callbacks, in async functions, or at module scope: https://react.dev/reference/eslint-plugin-react-hooks/lints/rules-of-hooks
- Keep domain logic out of React components. Components should orchestrate UI state and call typed client/service boundaries; matching, queueing, provider normalization, auth, persistence, and overlay composition logic belong in services/packages.
- Design overlay rendering as normalized playback instructions, not raw Twitch/provider payload rendering.
- Use Vite env variables deliberately. Vite exposes only `VITE_`-prefixed variables to client code, and env constants are replaced at build time: https://vite.dev/guide/env-and-mode/
- Do not put secrets in Vite client env, browser bundles, overlay URLs, logs, or exported config. Client-visible config is public by definition.
- Keep management UI and overlay UI browser-compatible. Electron, filesystem, SQLite, OS credential store, and Node-only APIs must stay behind backend/service or future IPC boundaries.

## Testing and Verification

- Use Vitest for unit and integration tests, but keep `pnpm typecheck` as a separate validation gate. Vitest documents that it transforms TypeScript for execution and does not type-check tests during the test run: https://main.vitest.dev/guide/learn/writing-tests
- Use Fastify `inject()` for HTTP route tests when a real network port is unnecessary. Fastify documents that `inject()` boots registered plugins and makes fake HTTP requests: https://fastify.dev/docs/v5.7.x/Guides/Testing/
- Use Testing Library queries that resemble user interaction. Prefer `getByRole` with accessible names, then label/text queries, and use test IDs only when user-facing selectors are not appropriate: https://testing-library.com/docs/queries/about/
- Use `userEvent.setup()` and user-event for interactions instead of low-level `fireEvent` when possible because user-event simulates fuller browser interactions and interactability checks: https://testing-library.com/docs/user-event/intro/
- Use Playwright for browser-visible workflows: new pages, form flows, auth/permission behavior, error/empty/loading/success states, and overlay rendering behavior.
- In Playwright, prefer locators such as `getByRole`, `getByLabel`, and chained locators that uniquely identify the target. Pair actions with web-first assertions that auto-wait for the expected user-visible result: https://playwright.dev/docs/locators and https://playwright.dev/docs/test-assertions
- Do not skip, weaken, or delete tests to make validation pass. Update tests only when behavior intentionally changes.
- Before a PR, run the relevant available gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` when Playwright coverage is applicable or configured.

## Electron Packaging Path

- Electron is the selected future desktop shell, but it is not part of the MVP scaffold unless a slice explicitly adds it.
- Keep Electron compatibility in mind now: renderer code must not directly access Node, filesystem, SQLite, OS credentials, or raw secrets.
- When Electron is introduced, follow Electron's security checklist: no Node integration for remote content, context isolation enabled, sandboxing enabled where possible, restrictive CSP, navigation/window creation limits, and validated IPC senders: https://www.electronjs.org/docs/latest/tutorial/security
- Expose narrowly scoped preload APIs through `contextBridge`; never expose raw `ipcRenderer` or broad Electron/Node APIs to the renderer. Electron's context isolation docs call out direct `ipcRenderer.send` exposure as unsafe: https://www.electronjs.org/docs/latest/tutorial/context-isolation

# Slice Implementation Rules

- Process one MVP slice at a time and keep slices independently reviewable.
- Before slice work, fetch latest remote state, confirm the current branch/worktree, confirm the target slice is still unimplemented, create a fresh branch from `origin/main`, and review the MVP docs plus existing slice plans.
- Each slice needs a committed slice-specific implementation spec before or alongside implementation.
- Keep changes scoped to the slice. Avoid unrelated refactors, dependency churn, formatting churn, or broad rewrites.
- Add tests with the implementation: positive paths, negative paths, edge cases, and failure behavior.
- For user-visible browser behavior, add or update Playwright coverage.
- After implementation, compare MVP requirements and the slice spec against the code and close all in-scope gaps before opening a PR.
