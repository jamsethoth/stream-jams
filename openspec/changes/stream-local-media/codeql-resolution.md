# PR #139 CodeQL resolution

The bearer parser must avoid overlapping regex repetition while preserving token extraction behavior. The cold-timing lock must retain stable cross-run exclusion and ownership-aware recovery in a private per-user directory. Protocol handlers explicitly await responses, management session cleanup compares attempt objects rather than promises, and probe imports precede their uses.

Three security alerts identify file/network boundaries in test tooling:

- #16: `media-streaming-recovery.spec.ts` reads a fixed tracked WebM fixture and uploads it to the owned `127.0.0.1` service launched in a fresh disposable profile. Neither an arbitrary user file nor an external destination is involved.
- #17: `media-streaming-formats.spec.ts` uploads explicit tracked fixtures or inline PNG bytes to the same isolated loopback test service. This intentionally exercises asset import.
- #18: `packaged-streaming-acceptance.mjs` serializes measurements from its own service/renderer as JSON under fixed `apps/desktop/out/streaming-acceptance`, using constant `formats.json` and `results.json` basenames. Responses cannot choose a filesystem destination and are never executed.

Initially these were assessed as intended test flows. The user requested executable content validation rather than relying on that intent. Runtime fixture and evidence checks now address those boundaries; no dismissal, source/sink obfuscation or suppression is appropriate merely because a path is expected. The earlier automatic approval review rejected dismissal; none was applied. Alert #19 was no longer open at the preceding analysis.

CodeQL must rerun against the published remediation commit before its alert gate can be considered resolved.

Verification passed: 35 focused bearer/session/private-overlay Vitest tests; 34 cold-runner/trace Node tests, including retained legacy-lock migration, directory redirection and replacement-owner protection; four rebuilt Chromium preview workflows; workspace production build; project and desktop-test typechecking; changed-file ESLint; and error provenance. No cache purge or physical playback was performed. The lock now lives at `~/.stream-jams/local-media-cold-timing/runner.lock`, refuses redirected directories, preserves retained recovery metadata, and fails closed if the legacy temporary lock exists.

## Runtime content validation

Recovery and format fixture uploads now use `scripts/media-streaming-fixtures.mjs`. Tracked inputs must match the reviewed manifest's exact size, SHA-256 and MIME type, and the existing core asset validator's signature/extension checks. Generated PNGs have bounded size, expected dimensions and a narrow chunk/header contract. Type and byte limits apply before copying; validation and upload use the same copied snapshot. The destination must be the exact owned HTTP `127.0.0.1` origin/port and `/assets/import` path, with credentials/query/fragment rejected and redirects disabled. This does not validate arbitrary private originals used by the separate manual acceptance script or guarantee decoder safety.

Packaged acceptance and resource evidence now use strict Zod schemas in `scripts/media-streaming-evidence.mjs`. Unknown fields, nonfinite numbers, unexpected IPC channels, arbitrary error text, malformed range fields and oversized strings/arrays are rejected; serialized evidence is capped at 16 MiB. Only parsed JSON reaches fixed-path writes and resource attachments. Diagnostics use fixed stage codes; invalid evidence produces a small validated failure envelope and fails the run. Native indefinite duration is deliberately represented as null, rather than accepting Infinity. Zod reuses the already locked 4.6.5 version as an explicit root test-tooling dependency.

Verification passed: 19 content-validation Node regressions, including a real redirect receiver that observes no forwarded bytes/credentials; all five hidden packaged software format workflows; the globally muted hidden packaged 1/25/100 MiB resource workflow and its fresh evidence write; workspace build; project/desktop-test typechecking; focused lint; and provenance. The Node regressions are included in `test:unit` for CI. No cache purge, audible playback or original private-media access was performed. At the preceding scan only #17 and #18 remained open; the content-validation commit requires a fresh CodeQL analysis, with no dismissal or suppression.
