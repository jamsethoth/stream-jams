# Repeatable streaming automation — September 30, 2026

Automation was added through fresh GPT-6.1 Sol medium agents. The initial batch changed no production behavior and reused Forge ASAR SHA-256 `2e48f9e5c110eb9db902054692fb0b4caee12c13f2b0fbf451dad9a4e2c77870`. The subsequent decoder-stall task exposed two shutdown issues, fixed and repackaged as recorded below. Tests use disposable storage/profiles, hidden windows, global mute and zero layer gain. The installed runtime and user data were untouched.

## Initial batch commands and confirmed results

Run from the repository root. Packaged native tests require a current `corepack pnpm desktop:package` output. Hardware selection requires enumerated outputs (two for recipient-isolation recovery); absence fails that explicit gate rather than silently skipping it.

| Command/check | Confirmed result |
| --- | --- |
| `corepack pnpm test:media-streaming` | Server build, six new server regressions and six-row actual-built-service benchmark pass. |
| `corepack pnpm test:desktop:media-streaming` | Five software format/compositing tests pass, 6.6 seconds. |
| `corepack pnpm test:desktop:media-streaming:hardware` | Three hidden, muted private-format/resource/recovery tests pass, 26.7 seconds. |
| Full Vitest | 291 files / 2,541 tests pass. |
| Node script regressions | 23 tests pass. |
| Full ESLint and project-reference TypeScript build | Pass. |
| Error provenance, whitespace and strict OpenSpec validation | Pass. |

Root verification logs are ignored under `apps/desktop/out/streaming-automation-root/`: `dedicated-command.log`, `desktop-software-final.log`, `desktop-hardware-final.log`, `unit.log`, `lint-final.log`, `typecheck-final.log` and the related script/provenance logs. Earlier affected browser/Storybook/package gates retain the scope recorded in acceptance-checkpoint.md; this test-only extension did not change those production surfaces.

## What is now repeatable

- Format coverage: progressive end-metadata MP4 seeking, valid unsupported ADPCM rejection, truly audio-only Opus WebM, animated GIF continuity, transparent PNG and two concurrent private VP9-alpha videos with pixel compositing and skip teardown. Static fixture provenance/licensing is in `tests/fixtures/media/media-streaming-provenance.md`; no custom remuxer or new dependency was retained.
- Resources: 1/25/100 MiB first/repeat verification, exact 64 KiB maximum chunks, full fresh checksum reads, 4,096-byte range delivery, same-group coalescing, capacity rejection and zero terminal owner/grant/service/store-reader counters. The separate actual-built-service worker measures sampled allocation and post-GC retained external/ArrayBuffer growth. Native tests measure reference IPC, seeks, 100 ms process-memory observations, element teardown and Quit/PID exit.
- Recovery: actual HTTP paused-recipient isolation and generation invalidation; native delayed preparation, failed selected recipient, three rapid skips, actual renderer crash and actual owned utility-worker exit with Retry. Final native evidence recorded healthy preparation 854 ms and playback 1,001 ms for a 1,000 ms duration. Renderer and worker recovery each produced zero replay and one fresh completed occurrence.

Detailed assertions/evidence and limits are in automation-formats-checkpoint.md, automation-resources-checkpoint.md and automation-recovery-checkpoint.md. These suites use existing Vitest/Playwright and are included in their ordinary applicable discovery; hardware cases remain explicit opt-in gates.

## Remaining acceptance

- Native decoder-body stall after actual onset is now verified with supported PCM WAV through the packaged private audio player; see the follow-up below. Earlier unsuccessful WebM prefix experiments remain historical evidence, not successful video-decoder stall observations.
- Audible physical routing, two-device/alias behavior, amplification/fades/mute/stop and actual OBS/visible Windows compositor coexistence remain manual. Hidden pixel checks establish decoded alpha and source-over math only.
- True OS-cold-cache timing remains manual. No cache flush or privileged machine-state change occurred. Native working sets are observations, not constant-memory guarantees. Exact utility-process Node external-memory/internal ownership counters are measured separately in the actual-built-service worker because production IPC exposes no debug interface.

Tasks 5.1–5.4 are complete within these stated automation scopes. Mixed whole-feature acceptance tasks remain unchecked in tasks.md and delivery-status.md. Canonical spec sync/publication/archive remain pending overall acceptance; no install, commit, push or merge was performed.

## Decoder-stall follow-up

See automation-stall-checkpoint.md for real advancing native PCM decoding, withheld body delivery, bounded stalled failure, healthy-layer continuation, upstream cancellation and fresh playback without replay. The strict test exposed shutdown hangs hidden by earlier process-exit-only checks. Regression-backed fixes cancel owned media before HTTP drain and use Fastify's supported connection-close option for remaining sockets. Explicit shutdown may truncate in-flight HTTP responses; runtime ownership/SQLite cleanup remains fenced.

Final rebuilt ASAR: `14c343e31dff3a7c44efe831acbe823830f9e6984433641bedf5d6f6fb23ca14`. Both native commands pass: **five software tests and four hardware-tagged muted tests**. The updated server command passes **eight cases and the benchmark**. Affected verification passes **18 suites / 110 tests**, project typecheck and changed-file lint. The earlier full Vitest count above predates these follow-up production fixes; no new full-suite run is claimed. Final strict native cleanup verifies normal service stop, all captured PID exits and Quit in 134 ms. Tasks 3.6 and 5.5 are complete; physical audio/OBS and true OS-cold acceptance remain unchanged.
