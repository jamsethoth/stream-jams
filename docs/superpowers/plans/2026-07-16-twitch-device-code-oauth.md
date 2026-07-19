# Twitch Device Code OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unusable client-secret Twitch setup with a complete public-client Device Code OAuth flow in the Event Source wizard.

**Architecture:** The Fastify service owns Twitch Device Code requests, keeps `device_code` in an expiring in-memory map, and exposes management-protected start/poll operations using opaque local IDs. Successful polls reuse the existing token validation, OS credential storage, account repository, and EventSub reconnection pipeline; React opens Twitch activation, renders a fallback code/link, and polls until completion.

**Tech Stack:** Node.js 24, TypeScript 6, Fastify 5, React 19, Vitest, Testing Library, Storybook, Playwright.

## Global Constraints

- Default Twitch Client ID is exactly `r6jy78npqxcqe68xpsctkcecti6ba3`; a non-empty `TWITCH_CLIENT_ID` overrides it.
- `TWITCH_CLIENT_SECRET` and Authorization Code Grant are removed; no secret, implicit, or hosted fallback is added.
- Device codes, access tokens, and refresh tokens never enter browser responses, logs, diagnostics, URLs, SQLite, Storybook args, or screenshots.
- Access and refresh tokens remain in the OS credential store; non-secret account metadata remains in SQLite.
- Every Twitch response is runtime validated and token client ID must match the configured public client ID.
- Start and poll routes remain management-authenticated and rate-limited.
- No new dependency, database migration, router, or background timer service.
- User-visible failures remain human-readable and actionable with stable code and reference ID when available.

---

### Task 1: Twitch Device Code API Client

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-api-client.ts`
- Modify: `apps/server/src/modules/twitch/twitch-api-client.test.ts`

**Interfaces:**
- Produces:

```typescript
export interface TwitchDeviceAuthorizationRequest {
  readonly clientId: string;
  readonly scopes: readonly string[];
}

export interface TwitchDeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export interface TwitchDeviceTokenRequest extends TwitchDeviceAuthorizationRequest {
  readonly deviceCode: string;
}

export type TwitchDeviceTokenPollResult =
  | { readonly status: "pending" }
  | { readonly status: "denied" }
  | { readonly status: "expired" }
  | { readonly status: "granted"; readonly grant: TwitchTokenGrant };
```

- `TwitchApiClient` exposes `startDeviceAuthorization`, `pollDeviceAuthorization`, `refreshUserToken`, `validateToken`, and `getCurrentUser`.
- `TwitchRefreshTokenRequest` contains `clientId` and `refreshToken`, never `clientSecret`.

- [ ] **Step 1: Replace authorization-code tests with failing Device Code tests**

Cover exact form bodies:

```text
POST /device: client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers
POST /token: client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers&device_code=device-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code
POST /token refresh: client_id=client-id&grant_type=refresh_token&refresh_token=refresh-token-1
```

Tests must assert parsing of a valid device authorization, `authorization_pending`, `access_denied`, `invalid device code`, a valid token grant, malformed success bodies, malformed error bodies, and errors that do not contain token values.

- [ ] **Step 2: Run the API-client test and verify RED**

Run:

```powershell
corepack.cmd pnpm test:unit apps/server/src/modules/twitch/twitch-api-client.test.ts
```

Expected: FAIL because Device Code methods/types do not exist and refresh still requires `clientSecret`.

- [ ] **Step 3: Implement the smallest Device Code client**

Use `URLSearchParams`, the existing injected `fetch`, and existing response helpers. `pollDeviceAuthorization` must inspect JSON on non-2xx responses and map only known Twitch messages:

```typescript
switch (message) {
  case "authorization_pending": return { status: "pending" };
  case "access_denied": return { status: "denied" };
  case "invalid device code": return { status: "expired" };
  default: throw new TwitchApiHttpError(response.status);
}
```

Delete `TwitchAuthorizationCodeRequest` and `exchangeAuthorizationCode`. Require positive integer `expires_in` and `interval`, non-empty strings, HTTPS `www.twitch.tv` verification URI, and the existing strict token-grant contract.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: the API-client test file passes with no warnings.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/server/src/modules/twitch/twitch-api-client.ts apps/server/src/modules/twitch/twitch-api-client.test.ts
git commit -m "feat: add Twitch device OAuth client"
```

### Task 2: Device Authorization Service Lifecycle

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.ts`
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.test.ts`

**Interfaces:**
- Consumes Task 1 `TwitchDeviceAuthorization` and `TwitchDeviceTokenPollResult`.
- Produces:

```typescript
export const defaultTwitchClientId = "r6jy78npqxcqe68xpsctkcecti6ba3";

export interface TwitchConnectionStartResult {
  readonly authorizationId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
  readonly scopes: readonly string[];
}

export interface TwitchConnectionPollInput {
  readonly authorizationId: string;
}

export type TwitchConnectionPollResult =
  | { readonly status: "pending" }
  | { readonly status: "connected"; readonly connection: TwitchConnectionStatus }
  | { readonly status: "failed"; readonly code: "TWITCH_OAUTH_DENIED" | "TWITCH_OAUTH_EXPIRED"; readonly message: string };
```

- `createConnectionStart()` becomes async; `pollConnection()` is new; `completeCallback()` and callback input/state types are removed.

- [ ] **Step 1: Write failing lifecycle tests**

Tests must prove:

1. Start calls Twitch with sorted default scopes and returns no `deviceCode`.
2. The opaque ID comes from injected `generateAuthorizationId`.
3. Polling before `nextPollAt` returns pending without calling Twitch.
4. Upstream pending advances `nextPollAt` by `intervalSeconds`.
5. Denial and expiry delete pending state and return terminal results.
6. Unknown IDs throw a controlled `TWITCH_OAUTH_AUTHORIZATION_INVALID` client error.
7. Success validates client ID, resolves the user, stores both tokens only through `SecretStore`, persists only account metadata, deletes pending state, and invokes `onConnectionChanged`.
8. Public refresh omits a client secret and replaces rotated tokens while preserving `connectedAt`.
9. Credential-store failure does not persist metadata or report success.

- [ ] **Step 2: Run service tests and verify RED**

```powershell
corepack.cmd pnpm test:unit apps/server/src/modules/twitch/twitch-oauth-service.test.ts
```

Expected: FAIL on missing start/poll Device Code behavior.

- [ ] **Step 3: Implement expiring request-driven state**

Store only this server-side record:

```typescript
interface PendingDeviceAuthorization {
  readonly deviceCode: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
  readonly intervalMs: number;
  nextPollAtMs: number;
}
```

Before every start/poll, prune records where `expiresAtMs <= now`. Before awaiting Twitch in a valid poll, set `nextPollAtMs = now + intervalMs` so concurrent polls cannot duplicate upstream requests. Delete the record before token persistence on a granted result; errors remain fail-closed and require a fresh authorization.

Reuse `#storeTokenGrant`, `createTwitchTokenSecretRef`, validation, repository save, and `#notifyConnectionChanged`. `#assertConfigured` checks only a non-empty client ID plus credential-store availability.

- [ ] **Step 4: Run service and API-client tests and verify GREEN**

```powershell
corepack.cmd pnpm test:unit apps/server/src/modules/twitch/twitch-api-client.test.ts apps/server/src/modules/twitch/twitch-oauth-service.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/server/src/modules/twitch/twitch-oauth-service.ts apps/server/src/modules/twitch/twitch-oauth-service.test.ts
git commit -m "feat: manage Twitch device authorization"
```

### Task 3: Protected Routes And Runtime Configuration

**Files:**
- Modify: `apps/server/src/http/routes/twitch-auth.ts`
- Modify: `apps/server/src/http/routes/twitch-auth.test.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes Task 2 `createConnectionStart()` and `pollConnection({ authorizationId })`.
- `POST /twitch/auth/start` has no request body.
- `POST /twitch/auth/poll` body is `{ "authorizationId": "opaque-local-id" }`.
- Both return Task 2 start/poll results and use the existing management auth plus management rate-limit prehandlers.

- [ ] **Step 1: Write failing route/runtime tests**

Route tests assert start awaits the service, poll validates the opaque ID, both operations require management auth and rate limits, provider errors map without token data, and `/twitch/auth/callback` returns 404 without invoking OAuth work. Runtime smoke tests assert the exact default Client ID, a trimmed environment override, no client-secret dependency, successful mocked start/poll, and preserved EventSub connection callback.

- [ ] **Step 2: Run route/runtime tests and verify RED**

```powershell
corepack.cmd pnpm test:unit apps/server/src/http/routes/twitch-auth.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
```

Expected: FAIL because routes and runtime still implement Authorization Code Grant.

- [ ] **Step 3: Replace callback wiring with start/poll**

Resolve configuration once and pass it to both Twitch services:

```typescript
const twitchClientId = environment.TWITCH_CLIENT_ID?.trim() || defaultTwitchClientId;
```

Delete callback parsing/route/error mapping and `environment.TWITCH_CLIENT_SECRET`. Make start `await` the service. Parse poll bodies with a non-empty `authorizationId`; map invalid authorization IDs to 400 and provider/API failures to 502 through `sendHttpError`. Preserve request correlation logging without authorization IDs or Twitch URLs in metadata.

Update `.env.example` to describe only optional `TWITCH_CLIENT_ID` override.

- [ ] **Step 4: Run server Twitch and runtime tests and verify GREEN**

```powershell
corepack.cmd pnpm test:unit apps/server/src/http/routes/twitch-auth.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts apps/server/src/modules/providers/provider-management-adapters.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts
```

Expected: all focused server integration tests pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add .env.example apps/server/src/app.test.ts apps/server/src/http/routes/twitch-auth.ts apps/server/src/http/routes/twitch-auth.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
git commit -m "feat: expose Twitch device OAuth routes"
```

### Task 4: Management API And Event Source Wizard

**Files:**
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/management/providers/ProviderPage.tsx`
- Modify: `apps/web/src/management/providers/ProviderPages.test.tsx`
- Modify: `apps/web/src/management/providers/ProviderPages.stories.tsx`
- Modify: `apps/web/src/management/providers/provider-pages.css`
- Modify: `apps/web/src/stories/mock-apis.ts`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`

**Interfaces:**
- Produces browser-safe `TwitchAuthStartResultView` matching Task 2 start result.
- Produces `TwitchAuthPollResultView` matching Task 2 poll union.
- `ManagementApi.startTwitchAuth()` takes no input; `pollTwitchAuth({ authorizationId })` is added.

- [ ] **Step 1: Write failing management API contract tests**

Assert start/poll request methods and bodies, all three poll variants, exact safe Twitch host validation, valid timestamps/positive intervals, and rejection of malformed objects, unsafe verification URLs, leaked `deviceCode`, inconsistent connected account objects, and unknown poll states.

- [ ] **Step 2: Write failing provider wizard tests**

Use fake timers and a mocked `window.open`. Assert:

1. `Connect Twitch` opens a named blank window synchronously, starts OAuth, navigates it to the validated Twitch URI, and shows code/expiry/fallback link.
2. A null/blocked popup leaves the link and code usable.
3. Pending polls continue only at `intervalSeconds`.
4. Connected poll stops polling, displays the account, and changes the primary action to `Test connection`.
5. Denied and expired results stop polling, show actionable copy, and expose `Try again`.
6. Closing/unmounting clears the timer and never registers a provider.
7. Poll network/provider failures stop polling and use `ManagementErrorBanner`.

- [ ] **Step 3: Run web tests and verify RED**

```powershell
corepack.cmd pnpm test:unit apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx
```

Expected: FAIL because start still returns an authorization URL and no poll contract exists.

- [ ] **Step 4: Implement strict contracts and request-driven polling UI**

Use one authorization state object and one timeout ref:

```typescript
interface TwitchAuthorizationViewState {
  readonly authorizationId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
}
```

Open `about:blank` synchronously from the click handler, close it if start fails, and navigate it only to the runtime-validated Twitch URL. Schedule one `setTimeout` after each pending response; clear it on success, terminal failure, retry, wizard close, or unmount. Keep `Open Twitch` as a normal safe external link and show the code in selectable monospace text. Do not auto-run provider validation after OAuth completion.

Add Storybook stories for waiting, connected, denied, expired, and popup fallback using production components and typed mock APIs. Add only the CSS needed for the code/status row and mobile wrapping.

- [ ] **Step 5: Run focused web and Storybook tests and verify GREEN**

```powershell
corepack.cmd pnpm test:unit apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Expected: focused Vitest and all Storybook tests pass with axe enabled.

- [ ] **Step 6: Commit Task 4**

```powershell
git add apps/web/src/App.test.tsx apps/web/src/management/ManagementApp.test.tsx apps/web/src/management/management-api.ts apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPage.tsx apps/web/src/management/providers/ProviderPages.test.tsx apps/web/src/management/providers/ProviderPages.stories.tsx apps/web/src/management/providers/provider-pages.css apps/web/src/stories/mock-apis.ts
git commit -m "feat: connect Twitch through device OAuth"
```

### Task 5: End-to-End Coverage, Documentation, And Final Verification

**Files:**
- Modify: `tests/e2e/management.spec.ts`
- Modify: `docs/mvp-runbook.md`
- Modify: `docs/superpowers/plans/2026-05-30-stream-jams-slice-17-twitch-oauth-account.md`
- Modify: `openspec/changes/replace-twitch-oauth-with-device-code/tasks.md`

**Interfaces:**
- Uses the final HTTP and browser contracts from Tasks 3 and 4.

- [ ] **Step 1: Replace the Playwright OAuth handoff test**

Mock `/twitch/auth/start` with browser-safe Device Code fields and `/twitch/auth/poll` as pending once then connected. Assert the popup request, visible fallback link/code, automatic connected account update, explicit `Test connection`, review, registration, and active provider row. Assert request bodies never contain a client secret, device code, or token.

- [ ] **Step 2: Run Playwright and verify GREEN**

```powershell
corepack.cmd pnpm test:e2e
```

Expected: all Chromium tests pass, including Device Code onboarding.

- [ ] **Step 3: Update operator documentation**

Document that ordinary users click `Connect Twitch`, authorize with the displayed Twitch code, return to the wizard, and run `Test connection`. Remove client-secret and callback setup. Mark the historical Slice 17 Authorization Code implementation as superseded by this plan rather than rewriting its original validation record.

- [ ] **Step 4: Run all repository gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate replace-twitch-oauth-with-device-code --strict
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Live browser verification**

Restart the built local server, open `/manage/event-sources`, and verify desktop plus 390x844 mobile widths. Check no horizontal overflow, no overlapping code/actions, focus returns correctly, popup fallback remains usable, and browser console has no errors. Real Twitch completion may be validated only after automated mocked gates if performing it would grant account access during development.

- [ ] **Step 6: Sync CodeGraph and complete OpenSpec tasks**

```powershell
codegraph.cmd sync C:\Users\James\.codex\worktrees\7375\stream-jams
openspec.cmd list --json
git status --short
```

Expected: CodeGraph current, change tasks complete, and only intended implementation files remain.

- [ ] **Step 7: Commit Task 5**

```powershell
git add tests/e2e/management.spec.ts docs/mvp-runbook.md docs/superpowers/plans/2026-05-30-stream-jams-slice-17-twitch-oauth-account.md openspec/changes/replace-twitch-oauth-with-device-code/tasks.md
git commit -m "test: verify Twitch device OAuth flow"
```
