# Live UX Follow-up Verification

## Scope and finding reconciliation

The integration review tracked nine live UX findings. Five were already addressed by the merged integration: inventory clutter, the honest text-only **Sample message** clarification, operator priority, mobile navigation, and secondary asset filters. Sample message remains text-only, may retain unresolved variables, and is not a rendered-preview implementation.

This follow-up closes the remaining four areas:

1. Settings length through native progressive disclosure with visible status and attention.
2. The detached **Close window to tray** checkbox and label.
3. Readable event, module, reward, and asset-usage labels plus explicit Browser Speech units.
4. Home alert-configuration attention that is separate from setup completion.

The implementation reviewed the MVP UX spec sections **Management UI**, **Information Architecture**, **Cross-Cutting UX Rules**, **Home**, **Integrations / TTS Providers**, **Assets / Asset Library**, **Alerts Module / Alert Sets**, and **Settings And Backup**. It also follows the UI guidelines for Management UI, Dense Hierarchical Management, Accessibility, and Agent-Facing Story States, and reuses the existing spacing and typography tokens.

## MVP and behavioral boundary

This is a management-configuration change. It does not change stored identifiers, matching, queueing, provider activation, output routing, profile-review meaning, or Browser Speech numeric payloads. The Home summary checks saved content and relevant profile review state. It does not prove provider connectivity, browser-source connectivity, configured asset availability, physical-device delivery, or successful playback; operators still use the existing test and output workflow for delivery checks.

The new Home count is explicitly labeled **enabled defaults/variations** because it counts enabled inventory entries. The existing Active alert set count retains its rule-level meaning.

## States and accessibility

- Settings keeps Appearance and desktop behavior immediately available. Server, audio outputs, overlay surfaces, and data/backup use native `details` elements, remain mounted while collapsed, expose concise summaries, and open when errors or deep links need attention.
- Backup restore confirmation and key-regeneration choices appear only after a valid preflight. Data and backup retains an attention cue in its summary, and invalid-summary or preflight blockers remain visible in the opened content.
- Native summary keyboard behavior was verified in Chromium. Controls use existing accessible names; the tray checkbox is adjacent to its explicit label at desktop and 390px widths.
- Event and module display text is presentation-only. Unknown delimiter-separated values remain visible in readable form. Reward lookup is conditional on actual reward conditions and is shared per resolved set context; failures retain the stored reward ID.
- Browser Speech labels and descriptions state the normalized units while the save payload remains numeric and unchanged.
- Home preserves setup readiness and problems, then reports alert configuration separately with affected alert names and editor links. Missing or unreadable documents fail closed as unavailable or needing review.

## Disposable served-app acceptance

Playwright starts the built Fastify application with an explicit temporary runtime root, an available non-production port, `InMemorySecretStore`, and an empty isolated environment object. Setup fails closed if any isolated-runtime prerequisite is absent. It does not use the user profile, port 39187, real provider credentials, test sends, or physical output devices.

The Settings scenarios mock typed desktop availability, backup status, three configured audio routes, and overlay-surface summaries. Reward catalog, asset usage, and Browser Speech provider responses are typed local route fixtures. The Home attention scenario uses the real disposable alert service and HTTP contract: it enables a synthetic starter alert without sending it, preserves the real server-derived `alertConfiguration`, and replaces only provider/setup readiness after `route.fetch()` so the setup-complete/configuration-attention distinction is exercised end to end.

Browser checks cover loaded Settings at desktop and 390px, native keyboard disclosure, tray alignment, Home attention and mobile reflow, reward titles, populated asset usage labels, module labels, and Browser Speech units and guidance. Component regression tests cover mounted draft preservation across collapse and reopen.

## Validation results

- `corepack.cmd pnpm lint` — passed.
- `corepack.cmd pnpm typecheck` — passed.
- `corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1` — 232 files and 2,024 tests passed.
- `node --test scripts/desktop-shutdown-fixture-data.test.mjs scripts/desktop-shutdown-exit.test.mjs scripts/portable-desktop-artifact.test.mjs` — 9 tests passed.
- `corepack.cmd pnpm build` — passed for all affected workspace packages. The existing Vite chunk-size notice remains.
- `corepack.cmd pnpm --filter @stream-jams/web build-storybook` — passed.
- `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci` — 22 suites and 227 interaction/accessibility tests passed. The existing Story Store deprecation and Vitest-addon suggestion remain.
- `$env:CI='1'; corepack.cmd pnpm test:e2e` — 47 Playwright tests passed with one worker and server reuse disabled.
- `openspec.cmd validate simplify-live-management-ux --strict` — passed.

Intermediate full-gate failures were diagnosed rather than counted as passing. Vitest first found stale Volume/event-label expectations and a Home contract fixture, then exposed a transient assertion around asynchronously loaded backup attention; the fixtures were updated and the final-state assertion now waits for the disclosure to settle. Storybook initially passed 226/227 because the invalid-restore story still expected a disabled Restore button; it now verifies the blocker and that valid-preflight-only controls are absent. Playwright initially passed 40/47 because existing Settings scenarios did not open the new disclosures, one assertion used the raw `screen-effects` label, and one Home fixture omitted the new typed summary. The affected 11 Playwright scenarios passed after those acceptance steps were corrected, followed by the full 47-test pass.

## Visual evidence

Approved served-app captures are retained outside the Git worktree at:

`C:\Users\James\.codex\visualizations\2026\09\15\01a0a5da-5be8-7732-9f0a-fd1343b7208d\live-ux-followup`

The set includes loaded compact Settings at desktop and phone widths, an open Server disclosure, Home attention at desktop and phone widths, reward and asset labels, and Browser Speech units/guidance.

## Limitations

This acceptance does not exercise live Twitch calls, live provider events, OBS browser sources, real audio devices, packaged Electron behavior, or physical/live-provider delivery. It makes no claim that a configured alert was delivered successfully.
