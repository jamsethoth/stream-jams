# Private desktop protocol feasibility

Verified September 30, 2026 in a disposable Windows runtime: Electron 44.4.4, Chromium 152.0.7977.130, bundled Node 24.21.0. Production desktop sources were inspected but not changed. The installed user app and private media were not opened.

## Reproduction and scope

From the repository root run:

```powershell
node openspec/changes/stream-local-media/desktop-protocol-probe.mjs --packaged
```

The launcher copies the installed Electron distribution from `C:/dev/projects/stream-jams/apps/desktop/node_modules/electron/dist`, writes a disposable `resources/app` entry point, and uses `Stream Jams Probe.exe`. `STREAM_JAMS_PROBE_ELECTRON` can override the source executable. This copy reports `app.isPackaged === true`; it is a packaged diagnostic, not the production Stream Jams package or its Forge/ASAR build. Omitting `--packaged` runs the standalone diagnostic entry point against the source executable. The launcher deletes inherited `ELECTRON_RUN_AS_NODE` from its child environment and uses `windowsHide: true`.

All writable runtime state, generated fixture, copied package and JSON output are under ignored `test-results/desktop-protocol-probe`. Profile/session paths are explicitly isolated. The fixture is a generated 440 Hz mono PCM WAV, 60 seconds, 5,292,044 bytes, created in bounded chunks; no private source media is used. An HTTP server on an ephemeral `127.0.0.1` port delivers 64 KiB file chunks with artificial delay. The private handler uses main-process Node fetch, allowlisted headers and a backpressure-driven `ReadableStream` wrapper around the upstream response body. The only full-response reads are the diagnostic's explicit 100-byte range and zero-byte HEAD assertions, not playback delivery.

The sandbox launch failed before the test because GPU subprocesses exited with Windows DLL error `-1073741515`. The authorized outside-sandbox launch passed with ordinary Chromium sandboxed/context-isolated/no-node-integration renderer settings; no `--no-sandbox` fallback was used.

## Observed results

Final packaged command exited 0. Detailed output: `test-results/desktop-protocol-probe/packaged-results.json`.

| Check | Observed result |
| --- | --- |
| Session-local handler | Actual private session handled media; default session reported scheme unhandled |
| Closed range | 206; `Content-Range: bytes 44-143/5292044`; exactly 100 body bytes |
| HEAD | 200; full `Content-Length: 5292044`; zero body bytes and no file stream |
| Native media playback/seek | Audio duration 60 seconds; seek to 50 seconds succeeded and issued `Range: bytes=4390912-` |
| Private origin | `location.origin === stream-jams-audio://player`; `isSecureContext === true` |
| Same-origin Web Audio gain | RMS at gain 1: 0.0860712; RMS at gain 2: 0.172783; ratio 2.00744 |
| Renderer networking restriction | `connect-src 'none'` blocked renderer fetch while `media-src 'self'` allowed native playback |
| Fixed host/handle/method restrictions | Wrong host, unknown handle and POST each returned 404 |
| Redirect rejection | Upstream 302 failed through `redirect: 'error'`; private response returned 502 |
| Native media detach | Pause/remove src/load cancelled both native reads via returned body's `cancel`; server closed both streams |
| Host revocation | Explicit upstream AbortController abort closed the remaining deliberately orphaned fetch read; active readers and registry controllers both returned to 0 |

The gain check connects `MediaElementAudioSourceNode -> GainNode -> AnalyserNode -> AudioContext.destination` with a silent `sinkId: { type: 'none' }`. This establishes non-silent samples and amplification without making sound or selecting a user's output device. It does not establish physical selected-device routing.

The final run served 2,818,148 total bytes across range/playback/cancellation requests, below one full fixture body despite multiple readers. This is evidence of incremental delivery/cancellation for this fixture, not a quantitative process-memory ceiling or proof of constant decoder memory.

## Cancellation compatibility requirement

**Do not rely on the protocol Request's abort signal, body cancellation alone, or `unhandle()` for owner teardown.** Across this probe the protocol request abort signal fired zero times. Cancelling the body returned by main-process `session.fetch()` did not call the protocol response body's cancel hook within 250 ms and left its upstream reader active. Native media seek/source detach did invoke the response body's cancel hook twice and close its associated HTTP/file reads.

Therefore keep an AbortController per active upstream request under the trusted owning handle/generation registry. The response-body cancel hook must abort it and cancel its upstream reader. Completion/error must remove it. Independently abort every registered upstream request on handle revocation, owner stop/release, window destruction, worker-generation invalidation and owned-service loss. Production stop still must detach/pause the renderer element because previously buffered media can continue after access revocation.

The probe deliberately preserves the fetch cancellation failure, then tests explicit registry revocation. It waits 400 ms and asserts server active readers are zero; output also records controllers zero, two native body cancellations, three early HTTP closes and zero request-signal aborts. Production tests should assert cleanup on real destruction/revocation, not infer it from Electron's handler unregistration.

## Recommended integration boundary

Expose a main-process adapter constructed with `{ session, scheme, host, trustedServiceOrigin, generation }` and trusted grant registry lookup. Suggested operations: `issue(recipient, serverGrant) -> privateReference`, `revoke(privateHandle)`, `invalidateGeneration()` and `destroy()`. The renderer's strict reference contains the distinct opaque private handle plus immutable asset metadata; it must never contain the server read grant, management token, storage path or arbitrary HTTP URL.

Keep server grants in trusted main-process entries bound to recipient, generation and owning playback/module revision. Parse only exact `scheme://host/media/<issued opaque handle>` URLs, reject query/userinfo/port/unknown host and non-GET/HEAD methods, and resolve against the issuing session's registry. Build the outbound URL from the trusted service origin and fixed grant route. Never proxy the renderer URL, renderer-selected recipient, caller Authorization/Cookie, arbitrary headers or redirects. Forward a deliberately bounded list of request validators/range and response media metadata; preserve server 200/206/304/416 status and headers without compression/body conversion. Add explicit network timeout and lifecycle cancellation.

Register both production schemes together before Electron ready, with `standard`, `secure`, `supportFetchAPI` and `stream`; do not set `bypassCSP`. Register each handler on the actual private session used by its BrowserWindow. Keep main document origin fixed. Add `media-src 'self'` to both existing CSPs and `img-src 'self'` to overlay CSP for scoped images; retain restrictive connect/navigation/permissions policy. No renderer fetch privilege is needed for native media. The probe's main-process `session.fetch()` calls do not loosen renderer CSP.

## Existing source pointers

- `apps/desktop/src/audio/audio-window.ts`: combined privileged-scheme registration; `persist:stream-jams-audio` session; resource-only handler; audio CSP currently permits only data/blob media; load/destroy lifecycle.
- `apps/desktop/src/audio/audio-player-policy.ts`: fixed `stream-jams-audio://player/` document and speaker-selection policy.
- `apps/desktop/src/audio/audio-preload.cts` and `audio-ipc.ts`: isolated private bridge and schema validation; add versioned reference contract here without exposing grants.
- `apps/desktop/src/audio/player.ts`: existing media-element/AudioContext amplifier and explicit sink routing; `createSource` currently constructs Blob URL from bulk bytes.
- `apps/desktop/src/audio/device-audio-player.ts`: authoritative element preparation, onset, gain, stop and source-release lifecycle.
- `apps/desktop/src/overlay/private-overlay-window.ts`: resource-only isolated overlay handler/session, CSP and destruction lifecycle.
- `apps/desktop/src/overlay/overlay-player-policy.ts`: existing fixed `stream-jams-overlay://surface/` origin and scheme privilege object.
- `apps/web/src/desktop-overlay/desktop-overlay-api.ts`: desktop visual Blob construction/revocation; retain its ownership semantics while switching visual/timer references.

## Boundaries still requiring acceptance

The exact overlay scheme was inspected, not independently exercised by this audio-scheme diagnostic. Video/image/GIF codecs, transparent video, large MP4 index layout, trackless video, explicit/two physical device routing, production IPC schemas, server grant scopes/expiry and production package ASAR/CSP/resource integration remain subsequent implementation/acceptance gates. No ffmpeg was present on PATH or the checked StreamingTools ffmpeg path, so this diagnostic did not generate a video. It does not mark the full packaged output matrix complete or justify task 3.7/4.x completion.

## Official API references

- [Electron protocol: session-local handlers, privileged registration and streaming flag](https://www.electronjs.org/docs/latest/api/protocol): scheme registration must precede ready; streaming media needs the stream privilege; custom partitions require handlers on their own session; `protocol.handle` returns a Response.
- [Electron net.fetch](https://www.electronjs.org/docs/latest/api/net): supports standard Request/Response interface through Chromium networking. The probe intentionally uses Node fetch for trusted fixed-origin loopback HTTP and session.fetch only for private-scheme diagnostic requests.
- [Node Fetch globals](https://nodejs.org/docs/latest-v24.x/api/globals.html#fetch) and [Node FileHandle.createReadStream](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlecreatereadstreamoptions): bounded positional file streams and fetch/ReadableStream integration.
- [Web Audio MediaElementAudioSourceNode security](https://www.w3.org/TR/webaudio/#MediaElementAudioSourceNode-security): cross-origin media classification can silence graph output; this probe empirically verifies same-origin graph samples.

These documentation links explain supported APIs. Cancellation and gain conclusions above come from the actual packaged diagnostic, not assumptions from documentation.
