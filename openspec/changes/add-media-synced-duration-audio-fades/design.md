## Context

Asset-library responses already expose nullable duration but persistence currently returns null. Alert and Screen Effect documents store fixed durations, while normalized playback already snapshots timing before delivery. Audio-bearing layers carry volume without an envelope.

## Goals / Non-Goals

Resolve one authoritative occurrence duration from persisted metadata, keep asset replacements linked for future occurrences, and apply the same linear local-audio envelope in preview, browser, and device playback. TTS fades, nonlinear curves, timelines, keyframes, and cross-layer synchronization remain outside this change.

## Decisions

- Add nullable `duration_ms` to asset metadata and extract duration after validation/transcoding through a framework-independent `MediaMetadataProbe`. Parser failure retains the valid asset with null duration.
- Add optional authoring `durationMode: "media" | "custom"`; absence means Custom. New creation paths write Media explicitly. Existing `durationMs` remains the custom value and documented fallback input.
- Resolve Media mode from visible Alert audio/video layers or a Screen Effect variant's video/separate sound. Exclude images, GIFs, hidden Alert layers, and TTS. Fall back to 5 seconds for Alerts or 10 seconds for effects and cap at 120 seconds.
- Cache repository duration lookups and invalidate on asset mutations. A bounded management repair path may read and parse legacy assets; live triggers may only query stored metadata.
- Resolve duration before queue admission and snapshot it into normalized playback instructions so an in-flight occurrence does not change after replacement.
- Store independent nonnegative fade durations on every local audio source. Missing values normalize to zero; enabling a fade in an editor starts at 500 ms.
- Normalize the effective source duration and requested fades before transport. Calculate linear gain from absolute elapsed time and proportionally clamp overlapping fades.
- Keep mute as a separate final multiplier. Recalculate envelope gain on play, pause/resume, seek, late join, and visibility recovery; existing stop/cancel cleanup owns timers and media elements.

## Risks / Trade-offs

- Container metadata is fallible. Null duration is non-blocking and produces a visible fallback warning.
- Lazy repair adds a management request for old assets. Its input is bounded and never runs on live delivery.
- Timers cannot provide sample-perfect gain ramps. Absolute-time calculation prevents drift and keeps browser and desktop behavior deterministic within their scheduling cadence.
- This branch remains stacked on PR #117 until that presentation dependency merges.
