# Music widget module verification

## Checkpoint 1: baseline and dependency feasibility (2026-10-04)

This checkpoint prepares primitives only. Music remains unimplemented: the default module registry lists Alerts, Screen Effects and Timers; `providerKindSchema` has no Pear kind. Controller refreshed origin before dispatch; current `origin/main` is `1d9dfe7e5b2ad5f2241f9a63673ca2815c86dd57`, proposal HEAD `ddbb2507c68893581d23ccd86a52ca919dbe518f`, branch `codex/add-music-widget-module`; starting tracked tree was clean. Standalone reference HEAD was verified as `91dcee0327eb97a75860a892a92630c32e0f9e3e`. No standalone files changed. Supported Pear protocol baseline remains 3.12.0; this checkpoint does not certify a running Pear installation.

### Reference feature map

| Reference behavior/source | Native destination and required adaptation |
| --- | --- |
| `pearYoutubeMusicSource.js`: auto, WS, 3-second polls, fallback | Pear server adapter; authenticated transport selection, serialized polls, authoritative reconciliation, cancellation/generation ownership |
| `playerState.js`: title/artist/album, same-track merge, artwork | Bounded complete MusicSnapshot, ordered artists, nullable album, opaque server artwork reference; never reuse old-track optional metadata |
| `progressClock.js`: interpolation, paused freeze, seek/clamp | Core position projection in milliseconds with shared clock; unknown duration remains null, no fabricated zero total |
| `overlayView.js` and `overlay.css`: artwork/placeholder, title/details/progress/time | One React MusicWidget for preview, browser and desktop with typed asset resolver and transparent failure |
| `overlayConfig.js`, CSS: full/compact | Saved per-profile/per-view defaults: full 640x178/art144/padding16/gap22; compact480x118/art0/padding14x18/title22/details14 |
| Dark/light and opacity | Native theme presets, saved overrides, 84% default; independent image opacity |
| Eight alignment values | top-left/center/right, center-left/right, bottom-left/center/right; default bottom-left |
| Overflow scrolling and reduced-motion media rule | Shared renderer measurement, managed reduced motion; stable wrapping/clipping when reduced |
| `overlayApp.js`: idle none/hide/compact, 1..600 seconds | Core projection from server appearance epoch; default none/30seconds; new track/genuine recovery resets, polling/pause does not |
| `mockMusicSource.js`, setup connection test | Pure fixture preview and existing explicit test-purpose output; preview never starts adapter, test connection never activates |
| Optional document custom stylesheet | Versioned Advanced CSS with shadow-root local selectors, AST policy, animation namespacing; no automatic standalone stylesheet import |
| Standalone lacks branding/fonts and pairing | Existing asset and SecretStore integration; managed fill/image/content ordering, fresh pairing after restore |

Three previously reproduced standalone defects are required regressions, not compatibility: HTTP204 retaining the old playing track; an outstanding poll publishing after disconnect; repeated polling `connected` events resetting idle. The source audit previously ran 21 focused tests; those historical results were not rerun or claimed as new evidence here.

### Guidance and reuse boundaries

Reviewed frontend routing (guide, UX Integrations/Assets/Target Profiles/Diagnostics/Backup sections, UI guidelines, tokens, overlay-error rule), approved Music design/specs, module-config persistence, runtime secret storage and configuration backup/restore. Provider registration remains separate from live status; selection/test/save semantics must stay explicit. Music defaults disabled; CSS and branding are schema-backed config. Credentials stay server-only in durable SecretStore. Backups enumerate every profile/view font/image reference, exclude identity/credentials/cache/live playback and require fresh pairing. Preview/debug may explain errors; live outputs stay transparent.

### Exact dependency decisions

- Core runtime: **css-tree 3.2.1**, MIT, pure JS with ESM/browser builds and Node support compatible with Node24; core dev: **@types/css-tree 3.2.0**. [Official parser](https://github.com/csstree/csstree/blob/master/docs/parsing.md), [project and builds](https://github.com/csstree/csstree), [changelog](https://github.com/csstree/csstree/blob/master/CHANGELOG.md). Current npm metadata queried October4. Active changelog and detailed AST/custom-property handling suit the shared browser/Node policy. [Security page](https://github.com/csstree/csstree/security) lists no published advisories and no security policy; that is not proof of safety. Parser is not a sanitizer. Enable positions and parseCustomProperty; reject all Raw nodes/recovery errors; CSS identifier escapes remain escaped in AST names and must be decoded before policy comparisons. Walk custom values and var fallbacks/references, enforce limits and property/selector/at-rule policy separately.
- Server runtime: **sharp 0.35.5**, Apache-2.0, built-in TypeScript types, Node>=20.9, Windows x64 prebuilt native optional dependencies. Existing DefaultAssetValidator only checks MIME/extension/signature/bytes (10MiB uploads); MusicMetadataProbe only measures audio duration. Neither proves raster decoding or dimensions. [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) supports metadata, strict decoding and pixel limits. Use PNG/JPEG/WebP signature admission before decoding, metadata format/side checks, limitInputPixels4096², failOn warning and actual decode; metadata alone is insufficient. [Security policy/history](https://github.com/lovell/sharp/security) documents native dependency advisories and continuous fuzzing; [September2026 librsvg advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) is patched in0.35.5. Reject SVG before decoder; avoid global loader configuration affecting other modules. Native footprint is justified by actual decode integrity rather than hand-written headers. [image-size](https://github.com/image-size/image-size/security) was rejected: archived June2026, header-only inspection, and prior infinite-loop DoS history. No global upload-policy change.
- Safe remote fetch: **no added dependency**. Node `https.request` accepts custom `lookup` through standard connection options ([HTTPS docs](https://nodejs.org/api/https.html), [Net lookup](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener)). Resolve approved host, validate all returned IPs, then supply only validated chosen address(es) to lookup on a fresh non-pooled request. Preserve hostname/SNI and ordinary TLS verification; never use lookup-before-global-fetch as proof of pinning. Reject redirects initially (allowed stricter policy), preserve5second abort and streamed2MiB bounds. Node fetch remains appropriate for loopback Pear requests; artwork uses this thin bounded HTTPS boundary. Undici's custom Agent is a viable alternative but adds an unnecessary direct dependency here. DNS/address policy is product-specific and must cover IPv4, IPv6 and mapped/private ranges in Task8.

Lockfile changes add these dependencies and their closure only; unrelated direct versions remain unchanged. Sharp Windows import/decoding succeeded locally. Desktop staging recursively copies installed optional dependency closure; Task16 must verify staged Sharp import/decoding and packaged binaries rather than assuming source-tree success proves packaging.

### Disposable fixture evidence

Executed `.superpowers/music-dependency-probe.mjs` (local untracked checkpoint aid). All assertions passed:

| Fixture | Observed result / implementation consequence |
| --- | --- |
| Escaped `u\\72l` background | Function name remains escaped, location1:25; decode identifier then reject resource function |
| Custom `--paint: u\\72l(...)`, `var(--paint)` | Function visible inside custom value at1:22; var visible at1:64; parseCustomProperty is essential |
| Malformed declaration `broken ???` | Colon expected at1:32 plus one Raw node; reject parse recovery |
| Generated PNG/JPEG/WebP | Actual decode and metadata2x3 passed for all three |
| Truncated files | All three rejected by actual decode |
|4097x1 PNG | Pixel product alone passes; explicit side bound must reject |
|4097x4097 PNG |4096² input pixel bound rejected |
| Non-resolving `pinned.invalid` sent to disposable local HTTP fixture | Custom lookup called once; peer127.0.0.1, original Host retained; no second DNS resolution |

The DNS fixture deliberately uses loopback to observe the socket locally; production remote policy must reject this address. It exercises the shared Node HTTP/TCP lookup primitive, not production TLS certificates, SSRF policy, redirects or generation cleanup. Those require implementation tests. Initial probe failed due to an incorrect relative fixture path, corrected before successful run. Initial unprivileged Corepack invocation failed EPERM; escalated execution reached typecheck, which exposed unhydrated desktop Electron/Node types after filtered dependency installation. A frozen full-workspace install remedies the environment without changing source or lockfile.

Final checkpoint verification: `corepack.cmd pnpm typecheck` passed after frozen hydration (exit0). `git diff --check` passed. Node ESM module and browser ESM bundle imports/parse were exercised successfully in a second disposable fixture; this confirms package/build compatibility, not actual browser UI behavior. No production UI changed, so Storybook, live workflow, full unit suite and physical Pear/OBS checks were not checkpoint gates. CSS policy, HTTPS/TLS/SSRF implementation and staged desktop decoder acceptance remain later-task requirements.
