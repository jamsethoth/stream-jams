# Media-synchronized duration and audio fades

## Context

Alerts and Screen Effect variants currently store a fixed playback duration. Operators must copy the duration of an attached video or audio file into a separate number field, and replacing that asset can leave playback shorter or longer than the media. Audio layers and video soundtracks have volume controls but no fade envelope.

The public asset-library contract has a nullable duration field, but the current asset record, SQLite table, and import pipeline do not populate it; the management service currently returns `durationMs: null` for every asset. The feature therefore includes authoritative duration extraction and persistence during asset ingestion. The management editors, browser overlays, desktop audio player, and playback coordinators already share normalized media instructions and absolute playback timing, so live triggers can consume stored metadata without inspecting media files.

This design depends on the focused Screen Effects editor and unified variant model in PR #117. It is a separate stacked slice so that the existing Screen Effects presentation change remains independently reviewable.

## Product behavior

### Duration modes

Every Alert and every Screen Effect variant has one duration mode:

- `Match longest media` derives playback duration from the longest eligible video or audio asset.
- `Custom` uses the operator-entered duration.

New Alerts and newly created Screen Effect variants default to `Match longest media`. Existing persisted Alerts, Screen Effect variants, and restored legacy backups default to `Custom`, preserving their current live timing.

Automatic duration remains linked to asset metadata. Uploading or selecting different media, replacing an asset globally, or repairing its metadata changes the next resolved playback duration without rewriting every referencing object. Playback already in progress keeps the immutable duration snapshot with which it was admitted.

Eligible media is:

- a visible Alert audio layer;
- a visible Alert video layer, whether or not its embedded soundtrack is enabled;
- a Screen Effect variant's video visual;
- a Screen Effect variant's separate sound.

Images, GIFs, hidden Alert layers, and TTS do not contribute. TTS duration is provider-dependent and is not reliably known before playback.

If automatic mode has no eligible asset with healthy positive duration metadata, an Alert uses its existing 5-second default and a Screen Effect variant uses its existing 10-second default. The editor presents this as a warning and names the fallback; it does not silently switch to Custom.

The existing 120-second playback limit remains authoritative. Media longer than that resolves to 120 seconds and produces a visible truncation warning. Custom duration keeps its current minimum and maximum validation.

### Audio fades

Every local media source that can produce audio has independent fade-in and fade-out settings:

- Alert audio layers;
- Alert video layers when embedded audio is enabled;
- Screen Effect separate sounds;
- Screen Effect video soundtracks when embedded audio is enabled.

Each fade is independently enabled. Enabling a fade starts at 500 milliseconds and reveals an editable millisecond value. Disabling it stores zero. Existing objects and legacy backups default both fades to zero.

The envelope is linear and multiplies the configured source volume. Fade in starts at the source's effective playback start. Fade out finishes at the earlier of the source media end or the containing Alert or Screen Effect cutoff. A source that begins late because the client joined an occurrence already in progress starts at the gain appropriate to its absolute elapsed time.

When requested fades overlap on short media, runtime proportionally clamps them to the effective source playback length. The source never exceeds its configured volume and finishes at zero gain. The editor explains the effective clamp but preserves the requested values so replacing the source with longer media restores the intended fades.

TTS fades are outside scope because Browser Speech and remote providers do not share the local media transport or a reliable duration boundary.

## Alternatives considered

### Server-resolved duration mode

Selected. Persist the mode and resolve the effective duration from current asset metadata while constructing a playback queue item. This keeps asset replacements synchronized and avoids cascading configuration writes.

### Rewrite every referencing object

Rejected. Asset replacement would need to locate and transactionally rewrite all referencing Alerts and Screen Effects. Playback reads would be marginally cheaper, but replacement would become more expensive and partial-update recovery would be harder.

### Editor-only automatic fill

Rejected. It would not stay synchronized after global asset replacement and could allow editor preview, browser playback, and desktop playback to disagree.

## Contracts and compatibility

`AssetRecord` and the `asset_metadata` SQLite table add nullable `durationMs` / `duration_ms`. A new migration leaves existing rows null. Asset-library responses expose the stored duration instead of always returning null.

The server package adds the exact MIT-licensed dependency `music-metadata@11.15.0` and implements the core import pipeline's new `MediaMetadataProbe` boundary. After validation and any transcoding, the pipeline asks that probe to inspect the normalized bytes. The server implementation calls `parseBuffer` with the MIME type, byte size, `{ duration: true, skipCovers: true }`, and returns a positive finite duration rounded to milliseconds. The [music-metadata documentation](https://github.com/Borewit/music-metadata) lists the accepted MP3, WAV, Ogg, MP4, and WebM containers and exposes buffer parsing with explicit duration calculation. Images and GIFs store null. Metadata failure does not discard an otherwise accepted asset; it stores null and surfaces the documented automatic-duration fallback warning. This keeps the third-party parser out of browser bundles and preserves the core package's framework-independent boundary.

Replacement extracts metadata from the replacement bytes before committing the same asset ID, so the next playback observes the new duration. For pre-migration assets, switching an object to automatic duration or requesting its selected-asset details invokes a bounded metadata repair through the management path and persists the result. Live trigger handling never reads media files or runs metadata extraction; if repair has not succeeded, it uses the documented fallback.

Persisted Alert documents and Effect variants add `durationMode: "media" | "custom"`. Their existing `durationMs` remains the custom value and the fallback value used when automatic resolution has no timed media. Compatibility parsers supply `custom` for stored documents that predate the field.

Audio-bearing configuration adds nonnegative integer fade durations:

- Alert audio layers: `fadeInMs` and `fadeOutMs`;
- Alert video layers: `audioFadeInMs` and `audioFadeOutMs`;
- Effect sounds: `fadeInMs` and `fadeOutMs`;
- Effect video visuals: `audioFadeInMs` and `audioFadeOutMs`.

Compatibility parsers supply zero for absent fields. Current strict request schemas reject unknown, negative, fractional, or over-limit values.

Normalized audio instructions carry the requested fade durations and the effective source playback duration. Browser overlay instructions and device-audio batches receive the same normalized envelope rather than reinterpreting authoring documents independently.

Backups include the new explicit fields. Restoring an older backup preserves its saved durations as Custom with fades disabled. Restoring a current backup preserves the selected mode and requested fades.

## Duration resolution

A framework-independent resolver accepts:

- duration mode;
- custom or fallback duration;
- the applicable maximum duration;
- referenced asset identities, health, media type, and stored duration.

It returns the bounded effective duration, the longest contributing asset identities, and any fallback or truncation warning. Tied longest assets are retained so the editor can explain the result accurately.

The server remains authoritative for live and test delivery. Runtime composition provides a small asset-duration catalog backed by the persisted `AssetRecord.durationMs`. It is populated lazily, cached in memory, and updated or invalidated when the asset library uploads, replaces, repairs, or deletes an asset. A cold cache performs a direct repository lookup. Neither filesystem reads nor media parsing occur on the trigger path.

The duration is resolved before admission creates the immutable queue item. All browser, desktop visual, and device-audio instructions for that occurrence use the same effective duration and timing window. The editor uses the same pure resolver over its loaded asset inventory for immediate draft feedback; the server recalculates on save, test, and live playback rather than trusting a client-derived value.

## Audio-envelope playback

The shared envelope calculation accepts base volume, absolute elapsed playback time, requested fades, and effective source playback length. It returns a gain from zero through the configured base volume. Browser overlays, Alert preview, Screen Effect preview, and the desktop audio player use this calculation.

Playback implementations schedule gain changes against the occurrence clock and recalculate after play, pause, resume, seek, late join, visibility restoration, and cancellation. Browser and desktop paths may use their existing media elements, but they must derive gain from elapsed time instead of accumulating incremental volume changes. This prevents timer drift and keeps device routes aligned.

Stopping, skipping, replacing, or shutting down playback cancels envelope updates and releases media elements through the existing cleanup paths. Muting remains a separate final multiplier and does not alter saved fade settings.

## Management UI

The Alert inspector's Alert settings and the Screen Effect Variant settings use the same wording:

- a `Duration` choice between `Match longest media` and `Custom`;
- automatic mode displays the effective duration and the asset or tied assets responsible;
- custom mode enables the existing numeric duration field;
- automatic fallback and 120-second truncation appear as concise inline warnings.

Each audio layer or enabled video soundtrack shows separate `Fade in` and `Fade out` checkboxes near volume. Enabling one reveals its millisecond field with a default of 500. The fields remain keyboard-operable, precisely labelled for assistive technology, and included in normal undo, redo, dirty-state, save, and revert behavior.

Selecting, removing, hiding, or replacing media immediately refreshes the draft's effective-duration explanation. Preview uses the current unsaved mode and fade values. Test and live delivery continue through their existing normalized pipelines.

The applicable MVP UX boundaries are the Assets duration metadata, Alert editor Alert and Layers inspectors, Alert preview/test separation, and the Screen Effects saved-variant delivery contract. Timeline editing, keyframes, nonlinear envelope curves, cross-layer synchronization controls, and TTS fades remain backlog.

## Validation and failure behavior

- Invalid custom duration or fade values block Save with field-specific guidance.
- Missing or unreadable assets retain the existing blocking validation.
- Healthy media without duration metadata produces an automatic-duration fallback warning.
- Media exceeding the product duration limit produces a truncation warning.
- A cold or failed asset-duration lookup uses the documented fallback for preview diagnostics but fails closed through existing missing-asset behavior when live media cannot be resolved.
- Fade clamping is deterministic and non-blocking because short media is valid.
- Save, test, or playback failures preserve the draft and use existing actionable management errors and reference IDs.

## Verification

- Core tests cover longest-media selection, ties, hidden and unsupported media, fallbacks, bounds, Custom mode, fade defaults, clamping, late elapsed time, and mute multiplication.
- Import-pipeline tests cover duration extraction for the repository's MP3, WAV, Ogg, MP4, and WebM fixtures, null metadata for images and GIFs, parser failure fallback, replacement, and exact millisecond normalization.
- Database and repository tests cover the nullable duration migration, old-row compatibility, persistence, lookup, and asset-library projection.
- Management metadata-repair tests cover a pre-migration asset, bounded failure, persistence, and proof that live trigger handling never invokes the parser.
- Compatibility tests prove legacy Alert documents, Screen Effect rows, and backups become Custom with fades disabled.
- Asset catalog tests cover cache hits, cold repository reads, replacement invalidation, deletion, and failed metadata reads without filesystem probing.
- Alert and Screen Effect service tests prove server-authoritative resolution for save, test, and live queue construction and stable duration for in-flight playback.
- Browser overlay and desktop audio-player tests prove fade-in, fade-out, overlap clamping, pause/resume, seek or late join, skip, and cleanup.
- Editor component and Storybook tests cover both duration modes, contributing-asset explanations, fallback and truncation warnings, fade controls, keyboard access, and preview behavior.
- Playwright covers creating new automatic objects, selecting media of different lengths, switching to Custom, replacing media metadata, and previewing fades in both editors.
- Run affected lint, typecheck, unit, build, Storybook accessibility, desktop, Playwright, strict OpenSpec, and diff checks before publication.

## Delivery

Implementation will be described by a dedicated OpenSpec change and delivered in a separate pull request stacked on PR #117 while that dependency remains open. After PR #117 merges, the branch can be rebased or retargeted to `main` without combining the review scopes.
