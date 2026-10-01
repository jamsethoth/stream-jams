# Streaming acceptance fixtures

These small fixtures combine authored test content with a specifically licensed upstream Chromium alpha test clip. No private user media or encoder dependency is included.

## `media-streaming-end-metadata.mp4`

Losslessly derived from this repository's `neutral-with-audio.mp4` on September 30, 2026. The original AVC/AAC sample-description boxes and `mdat` bytes are unchanged. The single fragment's sample durations and sizes were converted into ordinary `stts`, `stsc`, `stsz`, `stco` and video `stss` tables. Track/movie durations were filled from the sample sums. The empty fragmented movie header, `moof` and fragment random-access boxes were replaced by a conventional `moov` placed **after** `mdat` with corrected absolute chunk offsets. This is a progressive end-metadata fixture, not a fragmented file with its header merely moved.

173,934 bytes; `moov` starts at byte 167,791. SHA-256: `d883ce393cb7fb1c721913592e804f4478b462034828ce94f91f730d7fa7ca08`. The native packaged Chromium decoder reports 9.934542 seconds and seeks successfully to its interior midpoint using the real production private audio protocol. The regression test asserts the box ordering and native duration/seek; it needs no remuxer at runtime.

## `media-streaming-unsupported-adpcm.wav`

Authored valid Microsoft ADPCM RIFF/WAVE, rather than corrupted PCM or a renamed arbitrary file. Mono, 8,000 Hz, format tag 2, 4 bits/sample, 256-byte blocks, 500 samples/block. Its 50-byte extended format contains all seven standard predictor coefficient pairs: (256,0), (512,-256), (0,0), (192,64), (240,0), (460,-208), (392,-232). `fact` declares 8,000 decoded samples. Sixteen data blocks use predictor zero, initial delta 16, zero initial samples and zero valid ADPCM nibbles. Average bytes/sec is 4,096.

This codec is intentionally unsupported by the tested packaged Chromium WAVE decoder. Real asset import and byte-exact registered preview delivery succeed; the native element produces `MEDIA_ERR_SRC_NOT_SUPPORTED` within five seconds with no CSP violation. That is a codec negative, separate from the existing malformed-container negative. If a future runtime adds support, this test must be revisited and a genuinely unsupported valid codec chosen.

## `media-streaming-animated.gif`

Authored GIF89a: 2 x 2 pixels, red and blue global palette, two full frames, 100 ms per frame, infinite NETSCAPE2.0 looping, disposal mode 1. Each frame's valid three-bit LZW stream clears before each pixel, so the code width remains fixed. Native private Timer playback samples pixels over one second and requires both frame colors and at least four changes. A static frame, stopped animation or re-created image that never advances fails the test.

The transparent PNG is generated from an 8 x 8 canvas during the test (opaque red left half, fully transparent right half). It is imported and decoded through the actual private Timer URL before native canvas pixel and destination-over compositing assertions. This establishes renderer pixel preservation and compositing; physical Windows/OBS visible transparency remains a separate acceptance gate.

## `media-streaming-audio-only.webm`

Authored once on September 30, 2026 by packaged Chromium's native `MediaRecorder` from a Web Audio `MediaStreamDestination` with one audio track and zero video tracks, recording Opus for three seconds. The zero-gain oscillator connected only to the stream destination, never to the physical audio destination. The 982-byte artifact has a native duration of about 2.88 seconds; the test decodes it in a video element and verifies zero video dimensions, then seeks to the known one-second interior point. Its optional selected-device test remains globally muted with zero element gain. SHA-256: `826c78eb2826c2648eeaea6168d1bef59b5ec015e0ae42f7957c3a6421b1b4b2`.

## `media-streaming-transparent-vp9.webm`

Unmodified 95,093-byte Chromium `bear-vp9a.webm`, pinned at commit `93f03265ed42c6f22e7b17c0f3502ed980e41251`.

- [Pinned upstream fixture](https://chromium.googlesource.com/chromium/src/+/93f03265ed42c6f22e7b17c0f3502ed980e41251/media/test/data/bear-vp9a.webm).
- [Fixture directory documentation](https://chromium.googlesource.com/chromium/src/+/93f03265ed42c6f22e7b17c0f3502ed980e41251/media/test/data/README.md) identifies VP9-alpha variants.
- [BSD license](https://chromium.googlesource.com/chromium/src/+/93f03265ed42c6f22e7b17c0f3502ed980e41251/LICENSE), preserved verbatim in `media-streaming-chromium-LICENSE`.

SHA-256: `4db46bc6c600c8a978cb88e2386af641ab1dd9b4e007242f41fd162530c81e80`. This upstream clip contains partial alpha: the observed 320 x 240 frame has alpha 68 across all 76,800 pixels, so requiring binary zero/full-alpha pixels would be a fixture error. The test checks nonopaque decoded alpha and source-over compositing onto a green background, allowing one channel value of rounding error. It does not substitute for physical OBS/Windows visible transparency acceptance.
