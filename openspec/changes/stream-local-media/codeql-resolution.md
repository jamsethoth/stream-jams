# PR #139 CodeQL resolution

The bearer parser must avoid overlapping regex repetition while preserving token extraction behavior. The cold-timing lock must retain stable cross-run exclusion and ownership-aware recovery in a private per-user directory. Protocol handlers explicitly await responses, management session cleanup compares attempt objects rather than promises, and probe imports precede their uses.

Three security alerts describe intentional test boundaries rather than unsafe production behavior:

- #16: `media-streaming-recovery.spec.ts` reads a fixed tracked WebM fixture and uploads it to the owned `127.0.0.1` service launched in a fresh disposable profile. Neither an arbitrary user file nor an external destination is involved.
- #17: `media-streaming-formats.spec.ts` uploads explicit tracked fixtures or inline PNG bytes to the same isolated loopback test service. This intentionally exercises asset import.
- #18: `packaged-streaming-acceptance.mjs` serializes measurements from its own service/renderer as JSON under fixed `apps/desktop/out/streaming-acceptance`, using constant `formats.json` and `results.json` basenames. Responses cannot choose a filesystem destination and are never executed.

These require explicit false-positive disposition, not source/sink obfuscation or weaker tests. Automatic approval review rejected GitHub dismissal because external security-record mutation needs explicit authorization. No dismissal or suppression was applied. Alert #19 is no longer open in the current analysis.

CodeQL must rerun against the published remediation commit before its alert gate can be considered resolved.

Verification passed: 35 focused bearer/session/private-overlay Vitest tests; 34 cold-runner/trace Node tests, including retained legacy-lock migration, directory redirection and replacement-owner protection; four rebuilt Chromium preview workflows; workspace production build; project and desktop-test typechecking; changed-file ESLint; and error provenance. No cache purge or physical playback was performed. The lock now lives at `~/.stream-jams/local-media-cold-timing/runner.lock`, refuses redirected directories, preserves retained recovery metadata, and fails closed if the legacy temporary lock exists.
