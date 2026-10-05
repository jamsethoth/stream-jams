# HTTP delivery checkpoint

September 30, 2026; implementation branch `codex/stream-local-media-delivery`, based on fetched `origin/main` at `bdfc085`. Approved planning commits were preserved on the implementation branch before source changes.

## Implemented

Existing authenticated management and overlay media routes now stream through inspected Node file handles with 64 KiB high-water marks. jshttp range-parser and fresh support the single-range and conditional response adapter. Readers are capped at 256 and close after completion, disconnect, and storage error. HEAD and validator-only responses do not open a body stream. Path resolution rejects junction escapes and detects changes between opening and inspection. Response headers use no-store; there is no media cache.

This checkpoint does not yet pin queued occurrences across multiple requests, retire old versions, create scoped grants, or change desktop IPC or management preview ownership. The installed runtime is unchanged. The original large-file desktop audio failure is not fixed by this checkpoint alone.

## Verification

- Core/server affected suite: 198 files, 1,606 tests passed.
- Focused tests: asset routes, web-shell authorization, local asset store, and real HTTP response tests passed (35 tests). Real HTTP coverage uses a 100 MiB file, checks its final five bytes, abandons a reader, and confirms capacity returns to baseline. An additional storage-failure assertion passed after the broader suite: an error after headers aborts the body and releases its reader.
- Server TypeScript build/typecheck passed. Focused ESLint and repository error-provenance check passed. OpenSpec strict validation and Git whitespace check passed.
- Fresh isolated service using the rebuilt server modules: health returned 200. Headless Chromium loaded a generated 10-second WAV, played it muted, sought to 5 seconds without a decode error, reloaded, and released all readers. This is browser delivery evidence, not packaged Electron or physical audio/OBS acceptance.
- The standalone library feasibility probe intentionally reports contract mismatches; see library-findings.md. Its failing exit status is evidence against direct @fastify/static media integration, not a passing application test.

## Remaining integration boundaries

Version ownership must be captured alongside duration in alert playback/test admission and screen-effect admission, then retained through queue lifecycle and persistent timer presentation revisions. The current AssetLibraryService.completeReplacement deletes previous storage immediately and must move to recoverable retirement.

DesktopAudioSink and DesktopVisualAssetResolver still read bounded full bodies. The private audio player and desktop-overlay-api still create Blob URLs. These remain until version pins, grants, and private protocol delivery are integrated together.

Registered preview consumers are AssetPreview, AlertCanvas, alert-preview-controller/use-alert-preview, ScreenEffectPreview, and TimerStackEditor, through AssetApi.getAssetFile. JSON diagnostic/backup exports are separate Blob users and remain out of scope.

Supported visual delivery includes PNG/JPEG/WebP/GIF and MP4/WebM; applicable audio delivery includes MP3/WAV/Ogg/WebM and supported soundtracks in MP4/WebM. Timer roles retain their existing format eligibility. Full format/output acceptance remains pending with the desktop and preview changes.
