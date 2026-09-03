# Windows Desktop Tray Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Default to one agent; delegate only with applicable authorization. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable Windows x64 desktop application whose local service survives hiding management to the tray and shuts down predictably on explicit Quit.

**Architecture:** Electron main owns an isolated management window, tray, and utility-process server. The server remains the single owner of application configuration, SQLite, provider runtimes, HTTP and WebSocket surfaces. Production device playback is a separate dependent change.

**Tech Stack:** Existing strict TypeScript/ESM, pnpm workspaces, Node/Fastify, React/Vite, SQLite/keyring, Vitest, Storybook and Playwright; exactly pinned Electron and Electron Forge added only for desktop hosting/packaging.

**Spec:** [Proposal](../../../openspec/changes/add-windows-desktop-tray-runtime/proposal.md), [design](../../../openspec/changes/add-windows-desktop-tray-runtime/design.md), and all three [capability deltas](../../../openspec/changes/add-windows-desktop-tray-runtime/specs). OpenSpec [tasks](../../../openspec/changes/add-windows-desktop-tray-runtime/tasks.md) are the authoritative completion ledger; checkboxes below provide execution detail.

## Global Constraints

- The desktop application SHALL own one local service process while preserving configured loopback URLs, the existing local data profile, OS-backed secret storage, and command-line startup.
- The system SHALL persist `desktop.closeToTray`, default it to true, and expose an explicit desktop-only management setting.
- The tray SHALL offer Open, Mute or Unmute according to authoritative playback state, and Quit. It SHALL NOT maintain a separate audio-mute state.
- No installer, signing, publishing, automatic updates, startup-at-login, Windows service, LAN binding, or `safeStorage` migration.
- Keep core framework-independent, web browser-compatible, exact dependency versions, strict project references, and NodeNext `.js` imports.
- Preserve CSRF, origin restrictions, rate limiting, management/overlay separation and fail-closed keyring behavior.
- Startup deadline: 20 seconds. Graceful-stop deadline: 10 seconds. Never kill an unrelated listener or auto-change the configured port.
- This plan authorizes no live-user data changes, secrets exposure, publication or merge. Use isolated profiles for automated tests; obtain permission before opening secret live OBS URLs.

## File And Responsibility Map

All paths below are repository-relative and resolve from the execution checkout, not from this document's directory.

| Area | Files | Responsibility |
| --- | --- | --- |
| Shared startup | new `apps/server/src/runtime/start-local-runtime.ts`, `apps/server/src/runtime/once-async.ts`; existing `apps/server/src/index.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/server/package.json` | Side-effect-free startup and one cleanup owner |
| Desktop host | new `apps/desktop/package.json`, `tsconfig.json`, `forge.config.ts`, `src/main.ts`, `src/service-worker.ts`, `src/service-supervisor.ts`, `src/desktop-ipc.ts`, `src/close-policy.ts`, `src/management-window.ts`, `src/management-preload.ts`, `src/tray.ts`, `assets/tray.ico` | Lifecycle, validated private transport and packaging |
| Config | existing `packages/core/src/config/{types,schemas}.ts`, `apps/server/src/config/{default-config,file-config-store}.ts`; new `apps/server/src/config/desktop-config-service.ts`, `apps/server/src/http/routes/desktop-config.ts` | Validated serialized settings and protected API |
| UI | existing `apps/web/src/management/settings/SettingsPanel.tsx`, `management-api.ts`, `management-http-client.ts`, `routing/dirty-navigation.tsx`, `ManagementApp.tsx`; new `settings/DesktopSettingsPanel.tsx`, `desktop/desktop-bridge.ts` | Preference and guarded quit without Electron imports |
| Restore/build | existing backup service/snapshot tests, root `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/workflows/ci.yml`; new `scripts/stage-desktop.mjs`, `playwright.desktop.config.ts`, `tests/desktop/runtime.spec.ts` | Backup adoption, dependency closure, desktop validation |

Co-locate `.test.ts` / `.test.tsx` tests with each new production unit. Put the new UI stories in `DesktopSettingsPanel.stories.tsx`. Do not create a generic IPC framework or refactor unrelated server modules.

## Task 1: Reusable startup and idempotent cleanup

**OpenSpec tasks:** 1.1-1.3 and 2.1-2.3.

**Interfaces:** Consume existing `RuntimeAppCompositionOptions`, `createRuntimeAppComposition`, and `startServer`. Export `startLocalRuntime(options: RuntimeAppCompositionOptions): Promise<StartedLocalRuntime>` where `StartedLocalRuntime` has `composition: RuntimeAppComposition`, `url: string`, and `close(): Promise<void>`. Define `LocalRuntimeStartupError` containing the safe existing startup error, including suggested ports. Export only this runtime surface through `@stream-jams/server/runtime`.

- [ ] Confirm execution checkout and approved scope, fetch current `origin/main`, verify this slice is still unimplemented, and create the implementation branch using the worktree workflow. Preserve these planning artifacts in a slice-specific commit before or with implementation; do not publish.
- [ ] Build core before focused server tests: `corepack.cmd pnpm --filter @stream-jams/core build`.
- [ ] Add `apps/server/src/runtime/once-async.test.ts` with this regression, then run it and confirm failure because the module does not exist:

```ts
import { expect, it, vi } from "vitest";
import { onceAsync } from "./once-async.js";

it("shares cleanup across concurrent callers", async () => {
  const cleanup = vi.fn(async () => {});
  const close = onceAsync(cleanup);
  await Promise.all([close(), close(), close()]);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
```

Run: `corepack.cmd pnpm exec vitest run apps/server/src/runtime/once-async.test.ts`.

- [ ] Implement the shared shutdown primitive and apply it to composition-owned cleanup, including timer/intake shutdown:

```ts
export function onceAsync(work: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => pending ??= Promise.resolve().then(work);
}
```

- [ ] Add startup wrapper tests in `start-local-runtime.test.ts`: successful ready result, listen failure, provider-sync failure, cleanup on each failure, and no listen/provider side effects merely from importing the runtime subpath. Use temporary profile resources and current runtime boundary doubles. Move CLI orchestration into the wrapper, ensure catch paths close any constructed composition, and add SIGINT/SIGTERM cleanup to the CLI caller.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/runtime` and `corepack.cmd pnpm typecheck`. Expected: all focused tests/typecheck pass and the existing smoke composition remains the same. Commit this tested boundary with the spec, not a new alternative runtime composition.

## Task 2: Durable preference, safe API and restore propagation

**OpenSpec tasks:** 3.1-3.4. Files: config/API/restore entries in the map, core `src/index.ts` exports, and their co-located tests.

**Interfaces:** Add `DesktopConfig { closeToTray: boolean }` and `DesktopConfigUpdate = Partial<DesktopConfig>`. `DesktopConfigService.getConfig(): Promise<{ available: boolean; closeToTray: boolean }>` and `updateConfig(candidate: unknown): Promise<{ available: boolean; closeToTray: boolean }>` use the one ConfigStore; a callback publishes successful changes to the supervisor. Runtime options receive an optional desktop host adapter; CLI defaults unavailable.

- [ ] Add a failing test in `packages/core/src/config/schemas.test.ts`:

```ts
it("defaults desktop close policy and rejects coercion", () => {
  expect(desktopConfigSchema.parse({})).toEqual({ closeToTray: true });
  expect(desktopConfigSchema.safeParse({ closeToTray: "false" }).success).toBe(false);
});
```

Add `desktopConfigSchema` to that file's existing imports. Run `corepack.cmd pnpm exec vitest run packages/core/src/config/schemas.test.ts` and observe the missing export before implementing it.

- [ ] Add the schema and explicit config merge/default paths:

```ts
export const desktopConfigSchema = z.object({ closeToTray: z.boolean().default(true) });
// In appConfigSchema:
// desktop: desktopConfigSchema.default({ closeToTray: true })
// In FileConfigStore's validated nextConfig:
// desktop: { ...current.desktop, ...parsedPatch.desktop }
```

- [ ] Serialize initial creation and read-modify-write updates inside FileConfigStore, without recursively acquiring the same queue. Extend its temp-file tests to run desktop and playback updates concurrently and assert both values survive; a failed write must not poison the next operation. Do not add a second file writer in Electron.
- [ ] Implement `/config/desktop` GET/PATCH with existing security hooks. Test unauthenticated, invalid-CSRF, hostile-origin, malformed-value, rate-limit, CLI-unavailable and successful persisted updates using Fastify inject. Persist before invoking the runtime-change callback; callback failure must surface truthful persisted-versus-applied status.
- [ ] Extend backup restore and rollback's explicit config patches to include desktop settings and refresh the running host after success or rollback. Test old missing-field defaults, restored false, failure restoring prior true, and no automatic window close during restore.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/config apps/server/src/http/routes/desktop-config.test.ts apps/server/src/modules/backup` and `corepack.cmd pnpm typecheck`. Commit only when the restore/default/security regressions pass.

## Task 3: Secure host, supervision and tray policy

**OpenSpec tasks:** 4.1-4.5. Files: desktop host entries in the map plus root workspace build/test configuration.

**Interfaces:** `ServiceSupervisor.start(): Promise<{ url: string; closeToTray: boolean; muted: boolean }>`; `stop(): Promise<void>`; `setMuted(muted: boolean): Promise<void>`. Worker messages are parsed discriminated unions: ready, failed, stopped, desktop-config-changed and playback-state-changed; requests are start, stop and set-muted with request IDs. Define their Zod schemas in `desktop-ipc.ts`; no generic method/path payload exists.

- [ ] Resolve supported Electron/Forge releases from official package metadata, verify embedded Node/keyring compatibility, and pin exact versions/lockfile. Add the desktop TypeScript project and unit-test inclusion without weakening existing compiler flags. Add `apps/desktop/src/close-policy.test.ts`:

```ts
import { expect, it } from "vitest";
import { closeAction } from "./close-policy.js";

it.each([
  [true, false, "hide"],
  [false, false, "quit"],
  [true, true, "quit"]
] as const)("close policy %s / %s", (closeToTray, explicitQuit, expected) => {
  expect(closeAction(closeToTray, explicitQuit)).toBe(expected);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/desktop/src/close-policy.test.ts` to see the missing implementation, then implement:

```ts
export function closeAction(closeToTray: boolean, explicitQuit: boolean): "hide" | "quit" {
  return closeToTray && !explicitQuit ? "hide" : "quit";
}
```

- [ ] Build main/worker around Task 1. Apply a validated absolute `STREAM_JAMS_DESKTOP_USER_DATA_PATH` override before requesting the single-instance lock; tests use a temporary path so they cannot focus a real user's instance. Request the lock before worker startup. Use `utilityProcess.fork` after app readiness; validate all messages, request IDs and worker generations. Keep one stop promise; enforce 20-second startup and 10-second stop deadlines. Explicit Retry constructs a fresh owned worker only after the prior one has exited. Test with injected worker doubles and fake timers: second launch, port conflict, sync failure, timeout, unexpected exit, stale ready and duplicate stop.
- [ ] Build isolated management window/preload and origin/frame/sender checks. Preserve same-origin `/manage` and `/operator`, deny privileged external windows, route permitted external HTTP(S) links through `shell.openExternal`. Test hostile origin/subframe/webContents, unexpected message fields, and no public shutdown route.
- [ ] Wire tray Open and Mute/Unmute to supervisor state. On persistence failure leave the prior state and show a safe native/runtime error. Wire close/hide, before-quit and Windows session-end handling with no recursive quit loop. Test destruction occurs after service stop, not on hide, and kill targets only the owned worker.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/desktop/src` and `corepack.cmd pnpm typecheck`. Confirm no Electron runtime imports enter web/core domain code. Commit the passing host slice.

## Task 4: Settings and dirty-editor quit guard

**OpenSpec tasks:** 5.1-5.3. Read the frontend skill and routed UX/style documents before editing UI. Relevant UX sections: Cross-Cutting UX Rules, Alert Editor, Settings And Backup. Use existing controls/CSS.

**Interfaces:** `DesktopSettingsPanel` takes `{ closeToTray: boolean; disabled: boolean; onChange(value: boolean): void }`; parent SettingsPanel owns loading, save status and API calls. Browser-compatible `DesktopBridge` exposes `onQuitRequested(listener: (requestId: string) => void): () => void` and `resolveQuit(requestId: string, allow: boolean): void`; it is optional outside Electron. Implement request schema/sender checks in Task 3 preload/main and never expose raw IPC.

- [ ] Add a failing accessible-control test in `DesktopSettingsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DesktopSettingsPanel } from "./DesktopSettingsPanel";

it("changes close policy through the labelled control", async () => {
  const onChange = vi.fn();
  render(<DesktopSettingsPanel closeToTray disabled={false} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Close window to tray" }));
  expect(onChange).toHaveBeenCalledWith(false);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/web/src/management/settings/DesktopSettingsPanel.test.tsx`, then implement the controlled checkbox with explanatory copy:

```tsx
<label>
  <input type="checkbox" checked={closeToTray} disabled={disabled}
    onChange={(event) => onChange(event.currentTarget.checked)} />
  Close window to tray
</label>
```

- [ ] Integrate explicit Save, loading/error states and desktop-only visibility in SettingsPanel. Add typed GET/PATCH methods to existing management clients; do not bypass CSRF or duplicate a token store. Add stories for enabled, disabled, saving, failed and runtime-unavailable states.
- [ ] Extend the existing dirty-navigation guard for quit requests: Save and leave saves before replying true, Discard replies true, Cancel replies false, save failure keeps the app alive. Hiding invokes no quit request. Preserve draft undo/redo across hide/reopen. A crashed renderer cannot veto native Quit indefinitely; show the lost-unsaved-state warning and use the bounded lifecycle.
- [ ] Add Settings/ManagementApp tests and Playwright desktop coverage for Save/Discard/Cancel and preference persistence. Verify `/operator` navigation and external-browser management continue to function. Run affected web tests, Storybook build/CI checks, and `corepack.cmd pnpm typecheck`; commit this complete UI slice.

## Task 5: Self-contained packaging and release acceptance

**OpenSpec tasks:** 6.1-6.5. Files: Forge/staging/CI/test entries in the map, `docs/mvp-runbook.md`, and a new `docs/verification/windows-desktop-tray-runtime.md` evidence record created during implementation, not prefilled as passing.

**Interfaces:** Root `desktop:package` builds the workspace and stages/packages `win32-x64`; root `test:desktop` runs the separate Windows desktop Playwright configuration. The packaging output consumed by tests is `apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe`. Staging verifies all runtime dependency paths remain inside the package and includes native optional dependencies.

- [ ] Add an initial package-presence regression in `tests/desktop/runtime.spec.ts`, run it against the not-yet-packaged path and observe failure:

```ts
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "@playwright/test";

test("runnable Windows executable is produced", async () => {
  await access(resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"));
});
```

- [ ] Configure Forge with no makers/publishers and implement staging of built desktop, server, core, web and production dependency closure. Include checked-in tray/app icon and native binary unpacking where required. Add package commands:

```json
{
  "desktop:package": "corepack pnpm build && node scripts/stage-desktop.mjs && corepack pnpm --filter @stream-jams/desktop package",
  "test:desktop": "playwright test --config playwright.desktop.config.ts"
}
```

- [ ] Expand the packaged test using [Playwright's Electron API](https://playwright.dev/docs/api/class-electron). Launch the actual executable with a temporary profile/config and non-repo working directory, wait for health, query the built management window, persist/restart config and test SQLite/native keyring with test-specific names. Native keyring checks create and clean up only their own temporary entry. Verify all cleanup in `finally`, and assert no owned port/process remains. Do not treat a mocked development run as packaged proof.
- [ ] Add a Windows CI job for desktop package/smoke without running interactive audio or contacting real providers. Reuse existing composition adapter injection for deterministic tests; never add a production auth bypass. Manually verify tray/icon, duplicate launch, port conflict, both X behaviors, unsaved quit decisions, keyring failure diagnostics and Windows session-end behavior. Record actual results and limitations.
- [ ] Update runbook/architecture notes with the new startup option, unchanged storage/ports, tray exit instructions, unsigned-folder limitations and exact distribution exclusions. Preserve BL-030 residuals. Run all gates below before marking tasks done or proposing publication; commit only the verified in-scope result.

## Required Gates And Acceptance

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
corepack.cmd pnpm desktop:package
corepack.cmd pnpm test:desktop
openspec.cmd validate add-windows-desktop-tray-runtime --strict
```

Rebuild/restart only the owned test service, wait for health and verify the changed UI against that build. Report unavailable interactive/native checks as gaps, not passes. This is prerequisite acceptance for routing, not a claim that device playback exists.

## Coverage Reconciliation

| Requirement group | Execution task |
| --- | --- |
| Owned runtime, single composition, port failure | 1, 3, 5 |
| Preference defaults, concurrency, persistence and rollback | 2 |
| Single instance, tray, timeouts and session shutdown | 3, 5 |
| IPC/HTTP security and dirty-editor behavior | 2, 3, 4 |
| Packaged dependencies and independent Windows evidence | 5 |
| Deferred distribution boundaries | 3 dependency selection, 5 packaging/runbook |

After implementation, synchronize/archive only through the separately authorized OpenSpec workflow. Do not start the audio-routing change until this foundation is actually implemented and verified.
