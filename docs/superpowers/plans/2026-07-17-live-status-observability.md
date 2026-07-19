# Live Status Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Event Sources live state without reloads, make every current Twitch runtime failure traceable to sanitized Diagnostics evidence, and let users copy a selected Diagnostics problem as JSON.

**Architecture:** Generate reference IDs where Twitch connection, startup, or ingestion failures originate and carry the same ID through runtime status, provider management views, and Diagnostics. Reuse `RegisteredProviderView.error`, `ManagementErrorBanner`, the existing Diagnostics reference query, and the existing clipboard notice flow. Poll only the Event Sources provider-list endpoint every five seconds; the selected detail already reloads when its provider view changes.

**Tech Stack:** TypeScript 6, Fastify service composition, React 19, Zod contracts, Vitest, Testing Library, Storybook, Playwright.

## Global Constraints

- Poll Event Sources every five seconds without adding a push transport or dependency.
- Preserve the selected provider and last known rows when a background refresh fails.
- Generate one reference ID and one redacted diagnostic entry per distinct failure occurrence; repeated reads reuse that ID.
- Recovered or later failures receive a new reference ID.
- Copy only the already-sanitized `DiagnosticsProblemView`; never copy raw provider payloads or secrets.
- Keep full errors in the right detail panel, not inline in the provider table.
- Keep management authorization, redaction, runtime logging, and route parsing unchanged.

---

### Task 1: Generate Traceable Twitch And Ingestion Failures

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-client.ts`
- Test: `apps/server/src/modules/twitch/twitch-eventsub-client.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts`
- Test: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts`
- Modify: `apps/server/src/modules/events/event-ingestion-service.ts`
- Test: `apps/server/src/modules/events/event-ingestion-service.test.ts`
- Modify: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts`
- Test: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Test: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**
- Produces: Twitch client/runtime and ingestion statuses with `referenceId: string | null`.
- Produces: rejected ingestion results carrying the same source reference ID.
- Produces: optional `generateReferenceId` and `onDiagnostic` dependencies on each failure-producing service.
- Produces: redacted runtime log entries whose `correlationId` equals the status reference ID.

- [ ] **Step 1: Write failing source-reference tests**

Add focused tests that inject deterministic IDs and diagnostic spies. Assert a Twitch socket/revocation failure, a Twitch startup failure, and a malformed ingestion payload each return a non-null reference and emit exactly one matching diagnostic. Call `getStatus()` repeatedly and assert the diagnostic count remains one. Assert Streamer.bot adopts a rejected ingestion result's reference without emitting a second diagnostic.

```ts
expect(service.getStatus()).toMatchObject({
  state: "error",
  referenceId: "ref-twitch-1"
});
expect(onDiagnostic).toHaveBeenCalledOnce();
expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
  message: expect.any(String),
  referenceId: "ref-twitch-1"
}));
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts
```

Expected: FAIL because the statuses and options do not expose reference IDs or diagnostics.

- [ ] **Step 3: Add minimal failure recording at each source**

Add `referenceId` to the three statuses and a small private recorder in each producer. The recorder creates the ID once when status enters a distinct failure and invokes the injected diagnostic callback at that moment; `getStatus()` remains read-only. Rejected ingestion results carry that same reference. Streamer.bot adopts the rejected result as its current issue without invoking its logger again, so one failure occurrence produces one diagnostic entry.

```ts
export interface TwitchRuntimeDiagnostic {
  readonly message: string;
  readonly referenceId: string;
}

interface RuntimeIssue {
  readonly message: string;
  readonly occurredAt: string;
  readonly referenceId: string;
}
```

Clear the current reference on recovery/disconnect. Preserve the current reference while the same status snapshot is read repeatedly. Wire deterministic `ref_<random>` generation and redacted logger callbacks from `runtime-composition.ts` using the existing `RuntimeJsonlLogger` context shape.

- [ ] **Step 4: Run focused and composition tests and verify GREEN**

Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
```

Expected: PASS with the reference ID present in status and matching sanitized runtime log evidence.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/server/src/modules/twitch/twitch-eventsub-client.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/events/event-ingestion-service.ts apps/server/src/modules/events/event-ingestion-service.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
git commit -m "feat: trace event source runtime failures"
```

### Task 2: Project Current Runtime Errors Into Provider Detail And Diagnostics

**Files:**
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Test: `apps/server/src/modules/providers/management-ui-service.test.ts`
- Modify: `apps/server/src/modules/diagnostics/diagnostics-service.ts`
- Test: `apps/server/src/modules/diagnostics/diagnostics-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Test: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**
- Consumes: source status `{ state, message, lastErrorAt, referenceId }` from Task 1.
- Produces: `getEventSourceRuntimeView(provider)` returning `{ liveStatus, error }`.
- Produces: Diagnostics provider statuses with `referenceId` and no stale healthy problems.

- [ ] **Step 1: Write failing projection tests**

Assert an active provider runtime error overlays a complete `ActionableManagementError` onto both list and detail responses, including the reference-filtered correction route. Assert a healthy status does not create an active Diagnostics problem merely because `lastErrorAt` contains historical evidence.

```ts
expect(provider).toMatchObject({
  liveStatus: "error",
  error: {
    cause: "Twitch EventSub WebSocket error",
    referenceId: "ref-twitch-1",
    correction: {
      label: "Open diagnostics",
      route: "/manage/diagnostics?reference=ref-twitch-1"
    }
  }
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/modules/diagnostics/diagnostics-service.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
```

Expected: FAIL because management projects only `liveStatus`, while provider-status Diagnostics records discard correlation IDs and retain historical errors.

- [ ] **Step 3: Implement the runtime provider view**

Replace `getEventSourceLiveStatus` with one callback returning current status and error evidence:

```ts
interface EventSourceRuntimeView {
  readonly liveStatus: ProviderLiveStatus;
  readonly error: ActionableManagementError | null;
}
```

For inactive providers return `not-running` without a runtime error. For active `error` states build a human-readable error from runtime status and reuse the source reference in `/manage/diagnostics?reference=<encoded-id>`. Merge this transient error into `RegisteredProviderView.error`; do not persist it.

Extend `DiagnosticsProviderStatus` with `referenceId: string | null`, use it as provider error `correlationId`, and include provider-status problems only while `state === "degraded"`. This removes the stale `Provider status degraded` problem after recovery.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: PASS with matching provider detail and Diagnostics reference IDs, and no stale healthy problem.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/server/src/modules/providers/management-ui-service.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/modules/diagnostics/diagnostics-service.ts apps/server/src/modules/diagnostics/diagnostics-service.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
git commit -m "feat: expose event source runtime errors"
```

### Task 3: Poll Event Sources Without Losing State

**Files:**
- Modify: `apps/web/src/management/providers/ProviderPage.tsx`
- Test: `apps/web/src/management/providers/ProviderPages.test.tsx`
- Modify: `apps/web/src/management/providers/ProviderPages.stories.tsx`

**Interfaces:**
- Consumes: existing `listRegisteredProviders` and `getProvider` methods.
- Produces: five-second background refresh for `event-source` capability only.

- [ ] **Step 1: Write failing polling tests**

Use fake timers and sequential provider responses. Assert the first refresh occurs at 5,000 ms, changes the visible status and selected detail, and preserves a manually selected provider. Add a rejected refresh assertion that keeps prior rows visible and shows `Unable to refresh live status`.

```ts
await vi.advanceTimersByTimeAsync(5_000);
expect(listRegisteredProviders).toHaveBeenCalledTimes(2);
expect(screen.getByText("Healthy")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the provider-page test and verify RED**

Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/providers/ProviderPages.test.tsx
```

Expected: FAIL because no provider-list polling exists.

- [ ] **Step 3: Add the five-second background refresh**

Add an event-source-only effect using `window.setInterval`. On success replace the provider list, preserve `selectedProviderId` when it still exists, update `detail.provider` from the refreshed list, and clear only a dedicated `refreshError`. Key the detail-loading effect by selected provider ID instead of the provider object so polling does not re-fetch config or clear an unrelated operation error. On failure retain current providers and set an actionable refresh error. Clear the interval on unmount. Do not set the page loading state during background refreshes.

- [ ] **Step 4: Update the runtime-error Storybook state and verify GREEN**

Ensure `EventSourceRuntimeFailure` supplies the source error message, timestamp, reference ID, and Diagnostics correction route. Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/providers/ProviderPages.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/web/src/management/providers/ProviderPage.tsx apps/web/src/management/providers/ProviderPages.test.tsx apps/web/src/management/providers/ProviderPages.stories.tsx
git commit -m "feat: refresh event source live status"
```

### Task 4: Copy Selected Diagnostics Error As JSON

**Files:**
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.tsx`
- Test: `apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx`
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.stories.tsx`

**Interfaces:**
- Consumes: already-sanitized `DiagnosticsProblemView`.
- Produces: `Copy error JSON` in selected problem actions.

- [ ] **Step 1: Write failing clipboard tests**

Assert the button copies `JSON.stringify(selectedProblem, null, 2)`, includes the reference/correction fields, excludes fixture secrets, and announces `Error JSON copied`. Add a rejected `navigator.clipboard.writeText` case and assert the existing human-readable clipboard failure notice.

- [ ] **Step 2: Run DiagnosticsPanel tests and verify RED**

Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx
```

Expected: FAIL because the selected-problem action does not exist.

- [ ] **Step 3: Reuse the existing clipboard flow**

Add one secondary button beside correction/copy-reference actions:

```tsx
<button
  className="button button--secondary"
  onClick={() => void props.onCopy("Error JSON", JSON.stringify(props.selected, null, 2))}
  type="button"
>
  Copy error JSON
</button>
```

Do not add a server endpoint or a second serializer; the selected problem is already redacted and schema-validated.

- [ ] **Step 4: Update Storybook interaction and verify GREEN**

Update `ActiveProblems` to assert `Copy error JSON` is visible. Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx
```

Expected: PASS for success and clipboard failure behavior.

- [ ] **Step 5: Commit Task 4**

```powershell
git add apps/web/src/management/diagnostics/DiagnosticsPanel.tsx apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx apps/web/src/management/diagnostics/DiagnosticsPanel.stories.tsx
git commit -m "feat: copy diagnostics errors as json"
```

### Task 5: Complete OpenSpec And Live Verification

**Files:**
- Modify: `openspec/changes/refactor-management-ui-ux/tasks.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-4.
- Produces: completed OpenSpec tasks 3.7 and 7.6 plus a rebuilt running service.

- [ ] **Step 1: Run repository gates**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate refactor-management-ui-ux --strict
git diff --check
```

Expected: all commands exit 0; Vitest, Storybook, and Playwright report zero failures.

- [ ] **Step 2: Mark OpenSpec tasks complete**

Change tasks `3.7` and `7.6` from `[ ]` to `[x]`, then rerun strict OpenSpec validation.

- [ ] **Step 3: Rebuild, restart, and verify the live app**

Start the rebuilt server hidden on `127.0.0.1:39187`, wait for `/health`, and reload `/manage/event-sources`. Verify an `Error` row refreshes without a page reload, selecting it shows message/reference/Diagnostics link, and Diagnostics exposes `Copy error JSON` with valid formatted JSON clipboard content.

- [ ] **Step 4: Commit completion metadata**

```powershell
git add openspec/changes/refactor-management-ui-ux/tasks.md
git commit -m "docs: complete live status observability tasks"
```
