## Context

The October 5 audit at `90c5e8323f9b8bce0d85dbcf0eee8164da7dcf5e` found 100 custom error declarations: 79 server, 19 core and two browser classes. Five findings concern duplicate identity, missing diagnostic names, repeated envelopes, redundant subscription leaves and fragile boundary classification. This is a repair of those findings, not a target to minimize the class count. The source inventory and 24-name baseline are recorded in `audit-baseline.md`.

## Goals / Non-Goals

**Goals:** resolve E1–E5; preserve typed payloads, existing public codes/statuses, safe operator copy, cause provenance and single diagnostic ownership; enforce stable names; demonstrate failures through real boundaries with disposable collaborators.

**Non-goals:** a universal error registry; migrating every error to one hierarchy; changing exception serialization schemas; retry/queue semantics; UI redesign; persistence changes; merging browser and server implementations; removing payload-rich classes.

## Decisions

### 1. One constructor per Screen Effects missing-definition outcome (E1)

Move `EffectDefinitionNotFoundError` into module-owned `effect-errors.ts`; both services and the route import the same constructor. Re-export from former service locations if existing imports require compatibility. Map admission `EffectVariantNotFoundError` explicitly to the existing 409 `SCREEN_EFFECT_VARIANT_UNAVAILABLE` response; missing definitions map to 404 `SCREEN_EFFECT_NOT_FOUND`. A shared superclass alone would leave the duplicated-leaf `instanceof` defect intact.

Test disappearance between management and admission reads by controlling the availability callback, not timing sleeps. Exercise management, admission, Fastify route and global handler together. Leave the admission result union and mutation scheduling intact.

### 2. Two narrow shared primitives (E2/E3)

Add browser-compatible core `NamedError(name, message, options?)`, extending native `Error`, forwarding native cause and assigning an explicit stable name. Add server-only `SafeHttpError(name, statusCode, code, safeMessage, options?)`, extending `NamedError` and owning readonly envelope fields. Neither infers names from constructor/minifier output.

Migrate the existing HTTP-envelope leaves: `HttpResponseError`, `DesktopConfigError`, `SurfaceSettingsError`, `AutomationCredentialError`, `AutomationControlError` and `AudioOutputError`. Preserve public constructor signatures and specialized fields. Introduce optional cause parameters only at the end of signatures where absent. Preserve original leaf identities and mapping ownership. A `SafeHttpError` superclass is not blanket authorization to expose messages through the global handler.

Use `NamedError` for remaining unnamed errors in the baseline, preserving constructor arguments and fields. Do not force unaffected named classes into the new hierarchy. Keep `MediaCapacityError -> MediaUnavailableError` and `InvalidMusicAssetReferenceError -> InvalidOverlayModuleConfigError` intact. Keep the serializer unchanged: fix construction rather than guessing identity during serialization.

### 3. One code-discriminated subscription family (E4)

Replace three payload-free provider leaves with `StreamerBotSubscriptionError` in module-owned `provider-errors.ts`. Its closed code union retains `STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER`, `STREAMERBOT_SUBSCRIPTIONS_INACTIVE` and `STREAMERBOT_BROADCASTER_UNVERIFIED`. An internal fixed map retains each existing message and diagnostic name. Existing route code mappings retain 422/409/409 responses. Remove the three obsolete declarations after migrating imports/tests; do not retain empty alias subclasses. Keep selection-unavailable payloads in their existing specialized class.

### 4. Explicit first-party classification at owning boundaries (E5)

Replace the Screen Effects reference-message regex with `EffectReferenceUnavailableError`, carrying code `SCREEN_EFFECT_REFERENCE_UNAVAILABLE` and typed reference kind/id. Replace repository native error constructions for missing visual assets, sound assets and audio routes. Preserve existing safe conflict response copy through a bounded formatter.

Replace Streamer.bot runtime message-prefix selection with one `StreamerBotRuntimeError` family and a closed internal outcome union for connection failure, timeout and unavailable catalog/subscription operations. Select safe copy from fixed known outcomes. Retain existing client-failure reference adoption and recovery behavior; unknown exceptions remain generic and do not disclose remote content.

Give `DiagnosticsLimitError` and `PlaybackQueueItemNotFoundError` stable internal discriminant codes. Replace first-party name fallbacks with module-owned guards checking the known code and required typed payload. Constructor checks remain useful locally, but name-only and message-only lookalikes must not acquire expected-domain handling. Do not rewrite already working TTS/OAuth code mappings.

### 5. Narrow vendor adapters, not English-message inference (E5)

For SQLite foreign-key classification in asset deletion, use the native error contract (`ERR_SQLITE_ERROR` plus extended result code 787), verified through a disposable actual database on the declared Node runtime. Unrelated SQLite constraints and generic message lookalikes must not be treated as asset-in-use errors.

For Pear socket protocol failures, use the documented ws 8.22.0 protocol/limit error-code allowlist rather than English matching. The versioned [ws error-code documentation](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md#error-codes) identifies the available codes. Keep unknown network failures as transport failures, authentication close behavior intact, and token-bearing data out of causes/operator copy.

Retain Zod compatibility only in an explicit server boundary adapter: local `ZodError` identity first, then a narrow validated issues/name shape for existing cross-realm compatibility. This third-party exception must be documented and tested; it must not become a generic application-error name fallback.

### 6. Extend existing provenance enforcement (E2/E5)

Extend the existing TypeScript-based error-provenance checker, rather than adding another scanner/dependency. Require stable naming for custom native error subclasses; recognize explicit assignment and the known named foundation, including imported aliases and indirect application inheritance. Test checker acceptance/rejection fixtures. Do not ban all constructor checks or third-party adapters. Document ownership and stable-code conventions.

## Risks / Trade-offs

- Diagnostic type changes for 24 classes are intentional. Preserve codes and transported schema compatibility; do not rewrite historical log records.
- Consolidation can break imports or assertions. Search definitions/constructions/guards before deleting leaves; verify all relevant consumers.
- Broad safe-envelope dispatch could leak messages. Retain explicit route ownership and negative tests for unknown errors.
- Cross-realm guards could accept malformed lookalikes. Validate required payloads; reject unknown codes and name/message-only objects.
- Vendor error codes are version-sensitive. Test actual SQLite behavior on Node 24.16.0 and the locked ws version; keep adapters bounded.
- Static enforcement can misidentify imported/indirect bases. Cover those cases in checker tests and avoid broad exemptions.

## Migration Plan

Six sequential implementation slices are detailed in `docs/superpowers/plans/2026-10-05-repair-error-taxonomy.md`: E1 mapping repair; E2/E3 foundations and all names; E4 consolidation; E5 application boundaries; E5 vendor adapters; enforcement and regression closeout. No database or user-profile migration. Each slice preserves compatibility and has focused checks before broad final gates. Implementation starts from current `origin/main` after confirming these failures are still present. Rollback is ordinary code reversal; do not delete diagnostics or user data.

## Open Questions

None blocks implementation. Explicit names and narrow shared primitives are selected; the subscription diagnostic-name mapping preserves compatibility. If current main has repaired a finding, reconcile that slice and its tests rather than reintroducing an obsolete implementation.
