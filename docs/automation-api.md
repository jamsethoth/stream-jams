# Local automation API v1

This contract is for native same-computer integrations. Default origin is `http://127.0.0.1:39187`; use the configured port. No redirects, remote origins, management credential reuse or browser Origin headers. The legacy `/automation/timers` API retains its separate timer-only token. v1 credentials never authorize management or overlay routes.

## Pairing

1. Generate a random 43-128 character RFC7636-style verifier in client memory. Send its SHA256 base64url hash as `codeChallenge` in `POST /automation/v1/pairings` with `clientName` (1-80 chars) and requested `scopes`.
2. Response 201 has `id`, `clientName`, `scopes`, `comparisonCode`, `expiresAt`, `approvalUrl`, `status`. Open the relative approval URL on the configured local origin. The user compares the code in both apps and explicitly approves in Settings / Automation permissions. Names are self-reported, not authenticated binary identities. Request lives five minutes, max 32 pending.
3. Poll `POST /automation/v1/pairings/:id/status` with `{ "verifier": "..." }`, bounded backoff. On approved, POST the same body to `/exchange` exactly once. Response `{token,grant}`. Token is only returned by exchange and only its hash is persisted. Lost/ambiguous exchange requires new pairing, never replay. Unclaimed grants expire after five minutes; first authenticated request claims the grant.
4. Persist only in verified secure installation storage, never action settings or shared profiles. Never put verifier/token in URLs, logs or diagnostics. Plugin SDK global-settings storage/profile export verification remains required in the separate plugin project.
5. `POST /automation/v1/grants/self/revoke` with `{}` revokes the caller. Local credential deletion while offline does not revoke server access; use Settings when available.

Management-only (existing management authorization and CSRF): GET `/api/automation/pairings`, GET `/api/automation/pairings/:id`, POST `/:id/approve` with `{scopes}`, POST `/:id/deny` with `{}`; GET `/api/automation/grants`, POST `/api/automation/grants/:id/revoke` with `{}`. Grant metadata is visible here; tokens are never retrievable. Configuration exports exclude grants; restore invalidates grants and pending approvals.

Scopes: `timers:read`, `timers:control`, `playback:read`, plus `playback:<pause|skip|clear|mute>:<alerts|screen-effects>`, and `videos:read`, `videos:submit`, `videos:control` for the [Videos](videos.md#local-automation-api) routes under `/automation/v1/videos`. Related read permission is required when requesting controls. Approval can grant a subset. New modules require explicit new consent; no wildcard grants.

## Discovery and state

All subsequent routes require `Authorization: Bearer <installation token>`. `GET /automation/v1/capabilities` returns `apiVersion:1`, granted `capabilities`, `limits.maxAdjustmentMs:2592000000` and suggested `pollIntervalMs:1000`. `GET /automation/v1/state` adds:

- `runtimeId`: opaque runtime identity; invalidated by restart/configuration restore.
- `revision`: increasing snapshot content revision within that runtime; elapsed clock time alone does not advance it.
- `serverTimeEpochMs`: anchor for local monotonic countdown display.
- `timers`: `{id,label,state}`; state is null or `{status,generation,endsAtEpochMs}` running, `{status,generation,remainingMs}` paused, `{status,generation,completedAtEpochMs,expiresAtEpochMs}` completed. Authoring fields/assets/output configuration are excluded.
- `playback`: `{moduleId,paused,muted,muteOutputStatus,blockedBy,pendingCount,queueRevision,currentOccurrenceId}`. Blocking reasons: global-pause, do-not-disturb, module-pause. Mute output status distinguishes saved policy from failed delivery; applied means local delivery succeeded, not proof of physical audibility.

Only granted read domains are returned. Pending `queueRevision` is an opaque SHA256 content version of ordered occurrence identities, not an ordering counter. Use it only for equality; an unrelated module change cannot invalidate a clear. Overall state revision is for response ordering. Do not compare revisions across runtime identities. Invalidate in-flight client responses on reconnect; keep one state poll in flight. New/unknown runtime identity requires fresh capabilities/state. Local countdown reaching zero does not issue completion or cues.

## Commands

Every body includes `observedRuntimeId`. Unknown body fields are rejected. Commands return `{changed,outcome,state}`, where outcome is applied or unchanged and state is a complete authorized snapshot.

| POST path below `/automation/v1` | Additional body |
| --- | --- |
| `/timers/:id/activate` | `expectedGeneration: string|null` |
| `/timers/:id/reset` | `expectedGeneration: string` |
| `/timers/:id/stop` | `expectedGeneration: string` |
| `/timers/:id/adjust` | `expectedGeneration`, `action: increment|decrement`, positive integer `amountMs` <=2592000000 |
| `/timers/toggle-pause` | none |
| `/playback/:moduleId/toggle-pause` | none |
| `/playback/:moduleId/skip` | `expectedOccurrenceId: string|null` |
| `/playback/:moduleId/clear` | `expectedQueueRevision`, `expectedPendingCount` |
| `/playback/toggle-mute` | unique nonempty `moduleIds` array: alerts, screen-effects |

Activate chooses start/pause/resume at execution time. Completed display hold is inactive and can start immediately. A replacement generation conflicts, including idle observation replaced by an active run. Reset/stop/adjust on inactive timers do nothing. Reset uses latest saved duration silently, keeps generation/state/presentation/assets/outputs, and updates the captured duration only. Adjust preserves state; subtraction clamps at zero and completes with end cue even from paused. Active remaining time clamps to 30 days. Bulk toggle pauses running timers if any run, otherwise resumes all paused (including individually paused), never starts idle definitions.

Queue pause blocks next item; current finishes. Skip binds the displayed occurrence. Clear binds pending identity/count and leaves current playback; the plugin owns its one-second confirmation hold and cancels early release. Module mute changes audio only on current/future playback, not visuals/queue progression. All means both supported authorized modules: mixed -> mute all; all muted -> unmute all, no remembered subset. Timer cues remain independent. Legacy global mute compatibility is intentionally removed; dashboard/tray All controls use module policy.

## Errors and uncertain outcomes

Errors are `{error:{code,message}}`. 400 invalid input; 401 invalid/revoked credential or invalid proof; 403 wrong peer/Host/Origin or insufficient scope; 404 missing resource/pairing; 409 runtime/state conflict, unapproved exchange or maintenance; 429 rate limit with Retry-After. Internal failures include a diagnostic reference through the normal server error boundary.

During configuration maintenance, credential verification, grant listing, and both management/self revocation return 409 `AUTOMATION_MAINTENANCE_ACTIVE` without changing grant state. Verification can claim a first-use grant or expire an unclaimed grant, so these writes share the restore guard. Resume reads with bounded backoff after maintenance; revocation requires a new deliberate request.

Never automatically retry commands after timeout/disconnect/uncertain errors. Refresh and show Outcome unknown. Refreshed state cannot prove whether an adjustment occurred. A 409 requires a new deliberate gesture based on refreshed state. Stop client polling on revoked credentials, back off reads, and never replay offline presses. There are no durable command receipts/idempotency keys. Successful live timer transition does not guarantee a recovery checkpoint reached disk; diagnostics report checkpoint failures.

## Verification boundary

Server acceptance uses disposable databases, local services, browser approval and output fixtures. The separate Stream Deck HTTP adapter, SDK credential export checks and physical key/audio acceptance are separate deliverables. This API does not authenticate arbitrary local malware or protect against a compromised user account.
