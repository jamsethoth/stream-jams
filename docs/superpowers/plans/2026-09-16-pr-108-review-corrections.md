# PR 108 review corrections

Implement the four independently reviewed P2 findings on `codex/integrate-ux-audit-corrections`, starting from `50310f39d27c732be57835533a54f71dae659d39`. Keep the work local; publishing, merging, and PR state changes are outside this authorization.

## Scope and approach

Preserve the live-audit simplifications. Correct Settings attention and editor configuration assessment, and update desktop workflows to use the actual disclosed controls. Configuration readiness must not promise playback, device connectivity, or delivery. Follow the frontend guide and relevant Settings, alert authoring, and feedback sections of the MVP UX spec. Do not introduce deferred product features, dependencies, or a separate readiness engine.

## Tasks

- [x] Extend the active OpenSpec change with these correction requirements and verification tasks before implementation.
- [x] Update `tests/desktop/audio-routing.spec.ts`, `overlay-host.spec.ts`, and affected `screen-effects.spec.ts` interactions to open the relevant Settings disclosures. Check current action labels against production controls. Preserve persistence, routing, failure, and cleanup assertions; reopen sections after navigation/reload where necessary.
- [x] Correct `OverlaySurfacesPanel.tsx` summary: an enabled desktop surface requiring an unavailable display needs attention and exposes its actionable details. Unsupported or unused desktop output must not become a false warning. Cover available, failed, enabled-unavailable, and unused-unavailable states with focused tests and appropriate stories.
- [x] Correct `AlertEditorPage.tsx` readiness to assess the current edited document's profile intent. Saved inventory must not override changed targets. Reconcile saved set facts following save without discarding later edits. Cover Landscape-to-Vertical editing, saving without reload, and actionable current-profile links.
- [x] Align editor content/output eligibility with the existing Home assessment and canonical audio resolver. Empty enabled/reviewed content must need review; valid device-only audio must not require a visual profile. Preserve browser-profile review requirements for mixed output. Handle video soundtrack asset-type resolution consistently. Reuse a small shared core helper if that removes divergence; keep editor/set-specific orchestration local.
- [x] Add focused regressions for empty content, valid device-only audio, mixed browser/device output, stale retained profile metadata, current draft targets, and failed/unknown configuration facts. Preserve enabled-variant semantics in Home.
- [x] Update verification documentation with exact commands, results, and limitations.

## Verification and boundaries

1. Run focused regression tests and typecheck first. Diagnose failures before retries.
2. Run lint, typecheck, unit tests and supplemental Node checks, production build, Storybook build/interactions, and isolated Playwright app workflows as required by the frontend guide.
3. Build the packaged desktop artifact and run the nonphysical portion of the ordinary desktop Playwright suite (hardware tests excluded by its config). Inspection found that `audio-routing.spec.ts` selects a physical sink at zero volume and `overlay-host.spec.ts` selects a real monitor even though neither is tagged hardware. Preserve those tests and validate their updated interactions with isolated browser fixtures; defer their physical execution to CI. Do not weaken them or execute the explicit hardware suite locally. Report that desktop coverage limitation clearly.
4. Rebuild before live verification. Use a separate isolated service/profile; preserve the user's running app at port 39187, default profile, providers, OBS, and real devices. Capture relevant changed UI states without secrets.
5. Strict-validate the modified OpenSpec change and inspect the final diff against all four findings. Report any remaining coverage gap explicitly; passing simulated tests is not physical delivery acceptance.

## Implementation handoff

One GPT-5.6 Sol subagent at medium reasoning owns implementation, related specs, tests, and verification documentation. The parent owns this plan and independently checks the final patch and evidence. No overlapping edits. Do not push, merge, post review comments, or alter PR state.
