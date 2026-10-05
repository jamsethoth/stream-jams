# Streaming failure and recovery automation

September 30, 2026. New regression coverage complements existing player, host,
protocol and sink tests rather than duplicating their simulated timelines.

## Durable coverage

- `apps/server/src/modules/audio/media-streaming-recovery.test.ts`: real
  SQLite-backed ownership, checksum verification, FileHandle streams, Fastify and
  loopback HTTP. One recipient pauses its real response; a healthy recipient
  completes the same immutable version. Revoking the stalled grant drains its
  reader while the healthy grant remains valid for a later seek. Service
  generation invalidation drains readers and grants; only new ownership can
  deliver subsequent ranges. Old grants remain rejected after recovery.
- `tests/desktop/media-streaming-recovery.spec.ts`: opt-in `@hardware` packaged
  runtime regression requiring two explicitly enumerated outputs. Both outputs
  remain globally muted and playback volume is zero. Device negotiation is the
  injected external fault boundary: one selected device rejects and the healthy
  device waits 700 ms before binding. The test observes real private-protocol
  source playback and full configured duration after actual onset, skips three
  occurrences during negotiation without delayed onset, crashes only the owned
  audio renderer, verifies PID replacement without interrupted playback replay,
  then completes a fresh occurrence. It also terminates only the isolated app's
  exactly named local-service utility PID, chooses the existing Retry action at
  the native dialog boundary without showing a dialog, verifies old-player
  destruction and management/service recreation, acquires new management
  credentials, then completes fresh playback from the persisted asset library.
  Management windows are hidden and later
  show requests are suppressed; no desktop visual output is configured.

## Current evidence

- Focused related Vitest run: **5 files, 80 tests passed**. Includes the new two
  server integration tests and existing `desktop-audio-sink`,
  `device-audio-player`, `audio-host`, `private-media-protocol` regression suites.
  Log: `apps/desktop/out/streaming-automation-recovery/unit.log` (ignored).
- Scoped ESLint passed for both new test files.
- Server and desktop-test TypeScript project builds passed.
- Initial native launches under the filesystem sandbox exited before management
  startup; this matches the previously recorded native GPU subprocess environment
  limitation. Normal Chromium sandbox remains enabled. Native validation must run
  outside the filesystem sandbox with a disposable profile and isolated service.
- Native hardware run: **1 test passed in 10.4 seconds** outside the filesystem
  sandbox, with normal Chromium sandbox enabled. Slow preparation preceded the
  healthy onset by 856 ms; the healthy selected output then retained its full
  configured duration (1001 ms). The failed selected recipient never started;
  all three rapid skips had no late onset. An intentional real renderer crash
  replaced its PID without replay; a new occurrence completed. Normal Quit and
  captured native process exits were verified by the shared harness. Log:
  `apps/desktop/out/streaming-automation-recovery/native.log` (ignored).
  Durable token-free runtime evidence is written to
  `apps/desktop/out/streaming-automation-recovery/native-recovery.json` (ignored).
  Packaged `app.asar` SHA-256:
  `2e48f9e5c110eb9db902054692fb0b4caee12c13f2b0fbf451dad9a4e2c77870`.
- The added real worker-loss assertions completed in subsequent native runs:
  old service PID and renderer were replaced, management was recreated, Retry
  occurred once, no interrupted content replayed, and fresh playback completed.
  The final worker-inclusive durable suite awaits the root's combined hardware
  run after removal of the unsuccessful decoder-stall experiment.

## Limits and task 3.6

Existing device player tests cover stalled playback, bounded start/seek/play
failures, slow prepared elements, independent recipient actual-onset tails,
prepared cancellation and next-clip recovery. Existing audio host tests cover
worker ownership loss and renderer cooldown without replay; protocol tests cover
body cancellation and owner/generation revocation. The new HTTP integration adds
real stalled-recipient and service-generation resource cleanup evidence.

An experimental native decoder-body stall forwarded the first 32 KiB and then
96 KiB of the real WebM response while withholding subsequent pulls. Neither
prefix produced a real native video onset; the healthy WAV began after the
video preparation deadline. This fixture therefore did not establish a stall
after playback onset and is not retained as a regression or claimed as product
decoder-stall acceptance. The initial experiment also timed out service shutdown
and blocked on an error modal; only its verified isolated main PID and named
direct children were terminated, and the failed disposable profile was retained.
The revised experiment explicitly drained held reads and suppressed test-only
error dialogs; its failed-onset run shut down normally. No production-code bug
is inferred from that unsuccessful fault fixture.

Real HTTP body stalls, grant cancellation and healthy delivery are verified by
the server integration; deterministic player tests verify bounded native-player
stall classification, cleanup and next-play recovery. A packaged decoder stall
after demonstrated onset remains unproven. Physical sound, OBS and external
device timing remain separate outstanding gates. Task 3.6 is not checked by this
checkpoint alone.

Root final combined hardware command passed all three cases (26.7 seconds); this worker-inclusive recovery case passed in 15.4 seconds. Final evidence: healthy preparation 854 ms, actual-onset tail 1,001 ms; renderer PID replacement and named owned utility PID replacement each produced zero replay and one fresh completed occurrence. See automation-checkpoint.md and streaming-automation-root/desktop-hardware-final.log.

Follow-up: automation-stall-checkpoint.md supersedes the generic native decoder-body stall gap with a supported PCM WAV decoder regression after demonstrated onset. It also establishes strict normal service shutdown, not exit-only cleanup. Original failed WebM prefix experiments remain historical; no video-specific native stall observation is claimed.
