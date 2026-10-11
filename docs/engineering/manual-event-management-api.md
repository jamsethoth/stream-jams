# Manual event management API

Manual sends use the shared event bus. The server validates the action and referenced content before journaling, assigns the event and bus IDs, and admits delivery through the normal module consumers. Local editor Preview never calls these endpoints.

All endpoints below require the existing management session, allowed local origin, CSRF token and management rate limit. Overlay keys do not authorize them. Manual submissions are bounded to 65,536 bytes of JSON. Caller-supplied source registrations, delivery identities, destinations and recipient lists are rejected. Provider fields within sample data describe the simulated event; the actual bus and queue origin remains `manual`, with no subscribed registration.

## Source simulations

`POST /management/events/manual` accepts only a strict `ManualEventSubmission` with one of these action kinds:

- `simulate-canonical`: `event`, validated canonical sample data without caller event ID or occurrence timestamp.
- `simulate-external`: `identity` (`providerKind`, `sourceKey`, `eventType`) and optional `payload`, validated against an existing registered or saved consumer external identity.

Use the exported `manualEventSubmissionSchema` and `ManualEventSubmission` from `@stream-jams/core` as the authoritative field contract. Targeted module actions are rejected by this endpoint. Simulations run normal Alert, Effect, Timer and mapped Video selection without requiring a connected provider or fabricating a subscribed registration.

The response is a `ManualSubmissionReceipt`: `status` (`accepted` or `duplicate`), `eventId`, `busId`, `consumers` with their bounded outcome. `pending` means accepted delivery is still running in the background. It does not mean queued or delivered. Inspect Diagnostics / Event intake using the bus ID; never automatically resubmit an uncertain result.

`POST /alerts/test` is the legacy canonical adapter. It validates canonical sample data and strips legacy `id` and `occurredAt` fields before server identity assignment. Its response is now the same receipt, replacing the old `{status: "queued"}` response. It has no direct playback-enqueue fallback.

## Targeted Alerts

`POST /management/alerts/:alertId/editor/test` accepts the strict `AlertEditorTestRequest`: unsaved `document`, `targetProfileId` (or null), `samplePayload`, `includeAudio`, and `includeTts`. The route ID must match the document ID. Editable draft event/provider fields are allowed; only media eligible for this dispatch and included device routes are checked. Disabled or unreviewed visual profiles do not block a valid device-only send.

`POST /management/alerts/:alertId/editor/test-saved` resolves the saved document on the server. Its strict body contains only `targetProfileId`, `samplePayload`, `includeAudio`, and `includeTts`. The client cannot replace the route target or action kind.

Both return `AlertEditorTestResult`. A completed `queued` result retains existing delivered and unavailable destination feedback, plus `busId` and `eventId`. A `pending` result includes those IDs, `referenceId`, `test: true`, the selected profile, and empty destination lists. The management UI directs the operator to Diagnostics and does not report success or retry.

## Targeted Effects and failures

Existing `POST /screen-effects/:effectId/test` uses the selected saved variant and retains its live-impact confirmation contract. It now publishes one typed effect-test action and returns the existing admission outcome with `busId` / `eventId`; `status: "pending"` identifies unfinished admission without an occurrence ID or queued claim. Existing disabled-module, asset, output and queue-capacity outcomes remain unchanged.

Malformed or forged input returns 400. Reference validation rejected before publication returns actionable 422 with a diagnostic reference; adapter input rejection returns 422, or 410 only for retired-purpose input such as a Videos `purpose: "test"` payload; Alert delivery unavailability retains its existing 409 correction. Revalidation failures during consumer admission preserve existing route error feedback and the journal's failed outcome. Authentication, origin and CSRF failures retain their existing 401/403 responses.

The response-detail store is bounded to 128 entries and lazily removes entries older than 60 seconds. It holds only short-lived completed HTTP feedback. The journal owns admission outcomes, cursors and restart/replay; this store adds no retry or replay mechanism.

## Video requests and durable admission

`POST /videos/live/requests` and `POST /automation/v1/videos/live/requests` accept the existing strict video request body. Management/Operator channel is derived by the authenticated adapter; scoped automation requires `videos:submit`, and only `videos:control` grants autoplay. Callers cannot supply event/bus identity, provider registration, recipients or an action kind. The server publishes one `video-request` action and the Videos consumer performs enabled-module, link/allowlist, length, capacity and autoplay checks. Subscribed events already on the bus are consumed without republishing. Source simulations retain their truthful manual channel while channel-point no-autoplay and Streamer.bot autoplay policy still apply.

A completed POST returns 201 `{item,busId,eventId}` only after queue insertion and its durable receipt commit together. Consumer rejection keeps the existing `VIDEO_REQUEST_REJECTED` reason/field contract and 409/422/429 statuses, plus bus/event identity. Journal acceptance alone is not queue acceptance. If the bounded bus outcome wait ends first, HTTP 202 returns exactly `{status:"pending",busId,eventId}` without an item. Delivery continues under the existing tracked runtime work/shutdown lifecycle.

`GET /videos/live/submissions/:busId` uses management authorization/rate limits. `GET /automation/v1/videos/live/submissions/:busId` uses automation authorization and `videos:read`. Overlay keys grant neither route. Reads never resubmit. Committed acceptance returns 200 `{item,busId,eventId}`; pending returns 202; a committed rejection returns its original error/status. Failed/expired consumer delivery without a receipt returns 409 `VIDEO_SUBMISSION_UNAVAILABLE` with the bounded outcome/reference. Outside retention it returns 404 `VIDEO_SUBMISSION_NOT_FOUND`. All responses are no-store. Management/Operator shows pending identity, offers **Check submission outcome**, and prevents a second submit until the notice is resolved or deliberately dismissed. An uncertain network outcome must never automatically repeat POST.

Migration 043 adds runtime `video_bus_admissions` keyed uniquely by bus ID. Its validated, bounded result contains the original admitted item snapshot or rejection, so replay never creates a new item or repeats enrichment. Metadata lookup starts after the queue/receipt transaction and never holds a SQLite transaction. The receipt persists independently from journal/item foreign-key deletion: it is protected while the journal row exists or its item is queued/held/playing/paused. Cleanup deletes at most 250 eligible orphan terminal receipts per pass on startup, admission and a tracked once-per-minute runtime pass; terminal history rows do not keep it alive. Journal retention and active queue capacity bound protected receipts. Queue/item/revision commands retain their existing guards.

Receipts and queues are runtime state excluded from saved-configuration exports. Restored raw databases upgrade through the appended migration without changing live/test queue identities or revisions. The legacy test queue/requests and Recent requeue remain on their existing adapters until the separate queue-consolidation slice; an old test caller is not redirected to ordinary playback in this slice.
