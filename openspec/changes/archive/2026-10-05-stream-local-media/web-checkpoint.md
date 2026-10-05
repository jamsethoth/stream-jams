# Web and preview boundary checkpoint

September 30, 2026. This is a partial implementation checkpoint, not whole-feature acceptance. No production installation, commit or publication was performed by this agent.

## Implemented

- Browser `createOverlayAssetUrl` accepts an optional immutable version, preserving profile query and existing module/unified route authorization. `OverlaySurface` passes each instruction's `assetVersions[assetId]` to visual/video/audio resolution; `TimerStack` passes each card's `iconVersion`. Two concurrent occurrences/runs using one asset ID can resolve different retained versions.
- New server `MediaPreviewService` and `assets-preview` routes create, renew and release one management-session-owned media descriptor. Creation/renewal are protected management mutations. Five-minute owner/grant TTL is capped at session expiry; one descriptor URL/version survives renewal. Session revoke awaits preview release and aborts the owner's read signal. Timers release abandoned owners without requiring another request.
- New `createHttpMediaPreviewApi` uses the existing management client's authenticated CSRF mutations and validates the core descriptor schema. It rejects foreign/full URL responses without including response credentials in error text.
- New `acquireOwnedMediaPreview` owns one descriptor, renews every minute, releases late acquisition after abort and releases on dispose. It publishes unavailable state when renewal fails, permits local reacquisition on focus/visibility restoration, and preserves the URL on ordinary renewal. Expired source state clears before recovery acquisition, so consumers can pause/detach buffered media.
- Shared implementation agent owns registration into app/runtime and shutdown; registration handoff was sent and app/runtime imports appeared during final inspection.

## Verified at this checkpoint

- Focused browser suites: overlay-client, OverlaySurface, TimerStack, media-preview-api and owned-media-preview passed 80 tests, including throttled-focus recovery.
- Server preview route, preview owner and session suites passed 7 tests.
- Web and server project TypeScript builds passed.
- Focused ESLint for production and new test files passed; repository error-provenance check passed.

The earlier boundary checkpoint stopped before consumer migration. The completed consumer integration and subsequent verification are recorded below; packaged/physical format acceptance remains with the coordinating agent.

## Consumer integration completed

All registered management preview consumers now acquire owned descriptors and use native sources: AssetPreview, the shared alert canvas/audition group, ScreenEffectPreview, and TimerStackEditor. Local unimported File/Blob and archival downloads remain unchanged. AssetApi exposes the typed create/renew/release boundary; no production registered preview fetches full asset bodies or constructs Blob URLs.

One alert run acquires its deduplicated visible visual and enabled audio assets together. Both roles use the same descriptor snapshots, including MIME and duration. Screen Effect visual/audio timing also uses pinned snapshot duration. Source owners release after native pause/detach, failed/late preparation and unavailable renewal detach before release, and ordinary renewal retains the source and element. GIF replay unregisters each remounted image. Existing silent thumbnails, explicit audition, Play/Stop/Mute, layouts, fades and volume behavior are preserved.

Desktop web visual consumers now accept only private renderer references, derive the core private URL, probe native readiness, and detach before host release. Renderer envelopes use protocolVersion 1. Timer icon lookup uses [assetId, iconVersion], supporting concurrent versions and accepting same-revision reference refresh without restarting stable sources. Removed obsolete renderer body allocation and byte accounting; source readiness deadlines/cardinality remain.

Two real integration failures were corrected: the management HTTP client coalesces concurrent initial session creation so all preview owners share release credentials; the server shell owner added document/header no-referrer policy after the real browser test demonstrated that source response policy alone was insufficient.

## Consumer verification evidence

- Affected Chromium workflows passed 11 tests: asset management, alert video/audio, effects, timers, and the new rebuilt real-service preview regression. The real regression uses only temporary isolated data and repository fixture media. It proves stable URL/element through minute renewal, pinned old bytes after replacement, new version after reacquisition, no native authorization/referrer value, no-store range responses, and owner/grant/reader counts returning to baseline after navigation.
- The 12-file integration run passed 187 web tests; subsequent focused runs cover session coalescing, snapshot MIME, private dual-version timer refresh, native detach/release and repeated GIF remount cleanup. Final focused results are reported to the coordinating agent rather than combined into a misleading unique total.
- Web TypeScript build, affected-source/E2E ESLint and error-provenance check passed after the final production edits.
- Production main web Vite build passed after the final GIF fix. Desktop overlay production build was performed by the desktop agent. Route bundle budget check passed (bootstrap 68 KiB, overlay 127 KiB, operator 125 KiB, management 231 KiB).
- Final Storybook production build passed; proportional tagged interaction/accessibility runner passed 94 tests across six affected suites (21 unrelated suites excluded by tag).

This checkpoint completes the assigned web integration scope, not whole-feature acceptance. The coordinating agent owns broad final gates, format matrix, packaged private transport acceptance and any physical device checks. No installed application or user data was modified, and no commit/push/publication was performed.
