# Assisted physical acceptance — September 30, 2026

The user observed the final rebuilt Windows package using an isolated copy of their configuration, database and assets on port 54095. Production Stream Jams data and installation were unchanged. OBS's existing Effects source was manually pointed at the isolated port for this test and will need its original port restored when testing ends.

Confirmed by the user:

- Original large Clean Screen and Snowball WebMs: clean audio through SFX (Elgato Virtual Audio) at 15%.
- Both clips: smooth desktop playback on VG27A, correct transparency and complete cleanup.
- Both clips: simultaneous OBS preview and desktop playback, correct transparency over the OBS scene, clean SFX soundtrack without duplication and complete cleanup.
- Clean Screen: mute/unmute silenced and resumed audio without restarting or interrupting visuals.
- Clean Screen: early stop after a three-second SFX tone cleared visuals and soundtrack cleanly. Earlier ambiguous stop observations were not counted as passes.
- Clean Screen: fade-out starting at the three-second tone and continuing to the natural ending; eight-second fade-in followed by a tone and steady audio through completion.
- Snowball: 15% versus 30% gain comparison was louder and clean; 100% versus 200% amplification was louder and clean. The separate 150% run was not explicitly confirmed.
- Snowball: simultaneous SFX and Game routing delivered one clean copy to each device.
- Snowball: SFX and a temporary alias targeting the same device produced one normal 15% playback without doubling or increased volume.
- Cross-module desktop layering: a silent follower alert and countdown timer were visibly confirmed. Clean Screen appeared above them in the configured Effects/Alerts/Timers order; stopping only the effect at a three-second tone left the alert visible and timer counting down.
- OBS cross-module coexistence: all three module clients connected after the user changed Alerts and Timers source ports to 54095. The user confirmed coexistence with correct transparency/source stacking and effect-only cleanup at the tone, preserving the alert and countdown. OBS used separate module sources and its own source order; this does not establish unified-browser surface reordering.

The test document was returned to 15% SFX-only audio with no fades. Both visual outputs remain enabled in the isolated app. The temporary alias remains only in its disposable configuration. OBS remains pointed at the test service until restoration.

The temporary layering timer and active alert were stopped after confirmation. OBS's Effects, Alerts and Timers sources remain pointed at the isolated port and require restoration when testing ends.

## Additional physical format batch - October 1, 2026

The ignored `apps/desktop/out/manual-media-acceptance/physical-formats.mjs` runner used a separate inactive set in the same disposable profile, explicit variant tests, small local fixtures and SFX at 15%. It did not activate the set or alter existing effect documents.

- The user confirmed the initial images were present and intentionally silent, and the later moving gray-square videos ran correctly after clarification that their black backgrounds are authored opaque content. The requested sequence covered transparent PNG, opaque JPEG, animated red/blue GIF, transparent WebP, conventional and end-metadata MP4, and silent trackless MP4/WebM on desktop and OBS. This complements the earlier transparent original WebM confirmation.
- The user confirmed the repeated audio batch: a two-second WAV tone, two groups of five clean clicks (MP3 then Ogg, separated by a pause), followed by silence without lingering sound. Offline native decoding independently confirmed that the MP3/Ogg reference files contain click tracks with peaks once per second, rather than speech/music. The intentionally silent audio-only Opus fixture cannot establish audible Opus output; the original audible WebM effects provide the selected-device Opus soundtrack evidence separately.
- The user confirmed OBS port restoration after being given the installed configuration's `127.0.0.1:39187`. The Effects, Alerts and Timers test source ports were returned from 54095 to 39187. The automation and final reconciliation work remains authorized after the physical checks.

These observations supersede the corresponding physical audio, cross-module layering and OBS/desktop gaps in delivery-status.md. They do not establish true OS-cold timing, direct packaged utility-process Node external-memory/internal-counter measurements, every supported format on physical outputs, or a fresh full publication test matrix. Canonical spec sync and delivery are not performed by this checkpoint.
