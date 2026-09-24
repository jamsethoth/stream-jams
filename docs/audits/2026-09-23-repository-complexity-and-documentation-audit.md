# Repository Complexity And Documentation Audit

Date: September 23, 2026. Reviewed commit: `fec768c58a8b27a6921e87ea1ac8d4a346a8c05d` from `origin/main`, after a clean fast-forward from `62a9a53`. Code references and measurements in the findings describe that commit. The audit was first committed as documentation only; the resolution section records the later implementation on the same branch without rewriting the original evidence.

The principal maintenance risk is duplicated behavior and overly broad ownership, especially around alert instruction construction, local preview, runtime wiring, and management transport. The package architecture remains useful: this review does not justify replacing repositories, provider adapters, separate module queues, or desktop isolation with a new framework. Twelve findings follow; none establishes an urgent production incident.

## Coverage And Method

The repository-wide inventory covered 1,190 tracked files, including 351 non-test/non-story TypeScript/JavaScript source and script files and 386 Markdown files. Static scans covered source sizes, function bodies, repeated implementations, production references, dependency declarations, package boundaries, and relative Markdown file links. Manual tracing concentrated on the findings and their consumers; these counts do not mean every line received equal manual scrutiny.

| Area | Review focus |
| --- | --- |
| Core | Alert matching/resolution, Screen Effect authoring/admission/queues, module registry/config, templates, asset import, audio normalization and timing, contracts |
| Server | Entrypoint/lifecycle composition, Fastify route assembly, management façade, auth, provider integration, repositories/migrations, asset and backup boundaries, logging, playback coordinators |
| Web | Management API clients, editor state and preview ownership, inventories, providers, operator controls, browser/desktop overlay entrypoints, shared UI/media controls, Storybook |
| Desktop | Service supervisor, worker requests, separate audio/visual hosts, private preload/renderer ownership, packaging scripts and shutdown boundaries |
| Documentation/tooling | README, AGENTS, product/backlog/runbook, frontend guidance/tokens, design status, historical evidence, all active changes, canonical capability structure, CI/manifests, Markdown file targets |

Unused-code candidates were checked against production references; an exported symbol with only test references was not automatically treated as unused. In particular, helpers called within their own module and test-support utilities are not deletion findings. Approximate line savings below exclude tests and documentation.

## Findings

### R1 — P2: Alert test and live paths independently build the same instructions

**Evidence:** [`DefaultAlertResolver.#createEditorLayerInstruction`, lines 207–284](../../packages/core/src/alerts/alert-resolver.ts#L207) and [`createLayerInstruction`, lines 1123–1199](../../apps/server/src/modules/alerts/alert-editor-service.ts#L1123) both construct text, image/video, audio, TTS, and shape instructions. Both own layout propagation, text/box styling, video looping, soundtrack gain/fades, and nullable instruction fields.

**Impact:** Adding a layer property requires changes in two implementations before an editor test predicts live output reliably. Their differing TTS and destination behavior makes copying fixes between them especially error-prone. This is a maintenance finding, not a claim that current tests and live playback are already visibly inconsistent.

**Recommendation:** Extract one pure core layer-to-instruction function. Pass the normalized context, destination, identity, renderers, and resolved audio envelope explicitly. Keep test-only `operatorTest`, selected-document behavior, remote TTS handling, and live matching/variant selection with their existing owners. Add parity coverage for shared fields while retaining tests for intentional differences. Do not make tests rerun live sibling selection.

### R2 — P2: Runtime composition owns module readiness policy

**Evidence:** [`createRuntimeAppComposition`, line 214](../../apps/server/src/runtime/runtime-composition.ts#L214) spans 1,174 lines within a 1,566-line file. Beyond object construction and shutdown, [`validateEffectReferences` and `validateEffectOutputAvailability`, lines 468–550](../../apps/server/src/runtime/runtime-composition.ts#L468) decide media compatibility, route existence, recipient identity, unified layer visibility, display binding, and desktop readiness. Similar desktop eligibility is repeated for Alert tests at [line 927](../../apps/server/src/runtime/runtime-composition.ts#L927). Browser-source view assembly also lives here at [line 876](../../apps/server/src/runtime/runtime-composition.ts#L876).

**Impact:** Output behavior changes require editing the bootstrapping function, and individual readiness rules are difficult to exercise without composing the wider runtime. Alert and Effect paths can drift even when they use the same desktop surface.

**Recommendation:** Move readiness and source-view queries into the existing output/surface module boundaries. Share only the actual display/recipient predicates; preserve differing Alert profile and Effect destination rules. Keep explicit service construction, resource ownership, and cleanup in the composition root. A DI container or generic module-loader framework would add complexity here.

### R3 — P2: AlertEditorPage owns a media player as well as the editor

**Evidence:** [`AlertEditorPage`, line 207](../../apps/web/src/management/alerts/editor/AlertEditorPage.tsx#L207) spans 1,325 lines in a 2,485-line file. Alongside draft/history, save reconciliation, navigation, inspectors, and dialogs, [lines 775–1000](../../apps/web/src/management/alerts/editor/AlertEditorPage.tsx#L775) own preview clocks, asynchronous preparation deadlines, `Audio` objects, gain updates, blob URLs, seek/pause behavior, and cleanup registries.

**Impact:** A navigation/save change can affect media lifetime through shared closures and refs. Playback behavior is tested through a large component fixture, and rendering concerns obscure cancellation and ownership rules. Splitting JSX into more files alone would not address this.

**Recommendation:** Extract a focused local-preview controller with explicit prepare/play/pause/seek/stop/dispose operations and one owner for media resources, plus a thin React subscription hook. Reuse existing core duration/envelope functions and `media-gain-controller`; keep draft persistence and live test dispatch outside the controller. Preserve moderation, remote-TTS preview semantics, stale-request cancellation, and silence on unmount.

### R4 — P2: The management façade and optional app dependency bag add forwarding layers

**Evidence:** [`ManagementUiService`, lines 261–410](../../apps/server/src/modules/providers/management-ui-service.ts#L261) contains 34 single-return delegating methods totaling 110 lines, many forwarding an unchanged call. Its option callbacks, the large [`ManagementUiQueryService` interface, line 101](../../apps/server/src/http/routes/management-ui.ts#L101), and composition callbacks repeat these contracts. [`ServerAppDependencies`, line 63](../../apps/server/src/app.ts#L63) combines 23 `Partial` route dependency interfaces, followed by repeated runtime completeness/auth checks and type predicates at [line 300 onward](../../apps/server/src/app.ts#L300).

**Impact:** A new domain operation often requires edits in the domain service, façade options, façade method, runtime adapter, route interface, route handler, and client. Compile-time optionality permits incomplete production assemblies that must be rejected again at runtime. The Home aggregation and provider status decoration have real behavior, so deleting the entire façade would be inappropriate.

**Recommendation:** Keep a small Home/provider read-model service, and let domain-specific route registrars accept narrow service ports directly. Make required dependencies explicit in the production assembly; test individual registrars using a shared secured Fastify fixture. Preserve public routes and all fail-closed checks. Do this incrementally, rather than replacing the bag with another configurable registry.

### R5 — P2: Asset requests duplicate the shared management transport and DTO

**Evidence:** [`asset-api.ts`, lines 3–77](../../apps/web/src/management/assets/asset-api.ts#L3) repeats the asset record, session bootstrap/cache, CSRF token, session invalidation, and 401 retry already owned by [`management-http-client.ts`, lines 69–139](../../apps/web/src/management/management-http-client.ts#L69). Its local `AssetRecord` omits `durationMs` from the [core record](../../packages/core/src/assets/types.ts#L3). Asset failures become plain `Error`, whereas the shared client retains structured error code, reference, next step, and other details.

**Impact:** Session/error fixes need two implementations. The copied DTO has already drifted structurally; TypeScript cannot enforce parity while it is independently declared. Binary upload/download is a valid transport difference, but does not require a second authentication implementation.

**Recommendation:** Expose a small authenticated raw-response request operation from the existing management client, then implement asset binary bodies/blob reads through it. Reuse the core asset type/schema or declare an explicit intentional projection. Keep upload headers and retry behavior covered, including replacement failures and expired sessions.

### R6 — P2: Route fixtures use a different auth implementation from production

**Evidence:** [`createManagementAuthPreHandler`, line 9](../../apps/server/src/http/middleware/management-auth.ts#L9) verifies only a bearer session and has no production caller; 18 test files reference it. Production composition uses [`createManagementSecurityPreHandler`, line 1330](../../apps/server/src/runtime/runtime-composition.ts#L1330), whose [implementation](../../apps/server/src/http/middleware/management-security.ts#L70) also enforces origin and CSRF behavior. Only bearer-token extraction from the older module is shared with production. Planning follow-up also found that the asset replacement client sends `x-stream-jams-confirm-impact`, while the production CORS header allowlist omits it.

**Impact:** Route-level tests can pass with a security setup different from the deployed application. Runtime smoke/security tests provide additional coverage, so this is not evidence of an exposed production bypass. Same-origin asset replacement remains unaffected, but an approved cross-origin development UI can have its replacement preflight rejected because the custom confirmation header is not advertised.

**Recommendation:** Make the shared route fixture use production security with a deterministic session, allowed origin, and CSRF token. Retain positive and negative security assertions, add the existing asset confirmation header to the CORS allowlist with a preflight regression, then remove the obsolete bearer-only gate. Keep token extraction as a small utility. Do not simplify by removing origin/CSRF checks or weakening tests.

### R7 — P3: An entire earlier logging implementation is unused

**Evidence:** [`modules/diagnostics/logger.ts`](../../apps/server/src/modules/diagnostics/logger.ts) is 100 lines implementing severity filtering, record construction/redaction, hourly paths, and file writes. Its exports have no production consumers. Runtime construction uses [`RuntimeJsonlLogger`, line 330](../../apps/server/src/runtime/runtime-composition.ts#L330), with a different log format, read APIs, and retention integration.

**Impact:** Two implementations and their tests imply two supported logging contracts. Changes to redaction or fields can be made to the unused implementation without affecting the application.

**Recommendation:** Remove the unused implementation after transferring any uniquely valuable behavior assertions to runtime-logger tests. Preserve retention support for historical log files; deleting an old writer does not authorize deleting existing logs or compatibility readers.

### R8 — P3: The importer requires a transcoder that never transcodes

**Evidence:** [`MediaTranscodingStage` and `NoopMediaTranscodingStage`, lines 12–21 and 71–75](../../packages/core/src/assets/media-import-pipeline.ts#L12) add types, a class, an injected dependency, a field, and an awaited call. The only production implementation returns its input unchanged and is always selected in [runtime composition, line 277](../../apps/server/src/runtime/runtime-composition.ts#L277).

**Impact:** The import flow and fixtures carry a speculative extension point, and the name suggests media normalization that currently does not happen.

**Recommendation:** Keep validation, metadata probing, storage, and repository boundaries; pass validated original bytes directly until an actual approved transcoder is introduced. This should be a small behavior-preserving cleanup, with documentation explicitly describing validation/probing rather than claiming transcoding.

### R9 — P3: Tested geometry helpers are disconnected from production

**Evidence:** [`fitScreenEffectCanvas`](../../packages/core/src/screen-effects/layout.ts#L14) is used only by its test; production fitting occurs in [`OverlaySurface`, line 112](../../apps/web/src/overlay/components/OverlaySurface.tsx#L112). [`moveLayerWithArrow`](../../apps/web/src/management/alerts/editor/editor-state.ts#L440) likewise has only test callers, while the actual keyboard movement is implemented in [`AlertCanvas`, lines 167–175](../../apps/web/src/management/alerts/editor/AlertCanvas.tsx#L167).

**Impact:** Unit tests can pass for geometry code the user never executes, while the production logic evolves independently.

**Recommendation:** Choose the actual behavior owner. For these small implementations, remove disconnected helpers and retain production component coverage; alternatively wire a useful helper into production and remove the duplicate calculation. Keep snapping/clamping behavior and keyboard tests intact. The candidate reduction is roughly 57 source lines, not the entire editor-state module.

### R10 — P3: Identical path readers and overlay parameter parsers have multiple owners

**Evidence:** The 19-line `readPath` implementations in [`condition-evaluator.ts:101`](../../packages/core/src/alerts/condition-evaluator.ts#L101) and [`template-renderer.ts:23`](../../packages/core/src/templates/template-renderer.ts#L23) are identical after whitespace/comment normalization. Module and unified overlay parameter readers are also identical between [`assets.ts:268`](../../apps/server/src/http/routes/assets.ts#L268) and [`overlays.ts:185`](../../apps/server/src/http/routes/overlays.ts#L185).

**Impact:** Changes to own-property traversal or route validation must be kept aligned manually. These are concrete duplicate behaviors, unlike superficially similar provider protocols or queue implementations.

**Recommendation:** Use one private core own-property path reader and one server route-parameter parser boundary. Preserve inherited-property rejection, empty-segment behavior, target-profile validation, and HTTP error behavior. Existing core output-request schemas should be considered before adding another schema family; no utility dependency is needed.

### R11 — P2: Browser overlays load the management application bundle

**Evidence:** [`main.tsx`, lines 3–5 and 30–32](../../apps/web/src/main.tsx#L3) eagerly imports management, browser overlay, and operator apps before choosing the route. The current production build emits a single **815.53 kB JavaScript entry, 224.24 kB gzip**, and the Vite 500 kB advisory. The separate private desktop-overlay build demonstrates an existing narrower entry boundary.

**Impact:** Every browser-source client downloads and parses code for management editors and operator workflows it does not render. This is unnecessary output coupling, though the audit did not measure a startup-latency regression.

**Recommendation:** Address the existing [BL-041](../backlog.md) with separate entrypoints or narrowly lazy-loaded route apps and measured startup budgets. Preserve transparent overlay startup and test the production web-shell/manifest integration. Do not silence the warning by only raising its threshold.

### R12 — P3: The web package declares an unused direct tslib dependency

**Evidence:** [`apps/web/package.json:34`](../../apps/web/package.json#L34) declares `tslib` directly. Tracked source/configuration contains no imports or enabled `importHelpers`; the web TypeScript project uses `noEmit` and Vite for output.

**Recommendation:** Remove the direct declaration in a focused cleanup and rerun frozen installation, build, and Storybook gates. This is a dependency-removal candidate, not a verified package-removal result: `tslib` may remain transitively required by tools, and no lockfile savings are claimed here.

## Simplification Order And Estimated Size

Largest likely reductions first; extraction-only findings are deliberately not counted as deleted lines.

- `shrink:` Remove repeated management forwarding/partial-dependency plumbing; use existing domain services and explicit route ports. R4, approximately 150+ lines after replacement wiring.
- `delete:` Remove the unused structured logger; retain the production runtime logger. R7, 100 source lines.
- `shrink:` Unify authenticated asset requests and shared layer instruction construction. R5/R1, approximately 90–130 net lines combined.
- `delete:` Remove disconnected geometry implementations after confirming equivalent production coverage. R9, approximately 57 lines.
- `shrink:` Share identical own-property traversal and overlay route parsing. R10, approximately 30–40 net lines.
- `yagni:` Remove the mandatory no-op transcoder stage until real transcoding exists. R8, approximately 20 lines.
- `delete:` Remove the direct `tslib` declaration if the package-removal checks confirm it. R12, one direct dependency candidate.

**net: approximately -400 production lines, -1 direct dependency possible.** This is a conservative refactoring estimate, not an implemented diff; replacement APIs and preserved coverage determine the final result. R2/R3 primarily improve ownership, and R11 reduces delivered code rather than repository line count.

At the audit snapshot, backlog ownership was BL-054 through BL-056 and bundle work remained BL-041. The implementation order was verified dead code, then transport and instruction parity, then the larger ownership refactors, with each slice kept independently reviewable.

## Boundaries Worth Retaining

Typed SQLite repositories and aggregate mutation transactions protect persistence and rollback; single implementations alone do not make them unnecessary. The explicit backup table map and restore validation protect portability, device bindings, credentials, and schema compatibility. Do not replace them with unrestricted table reflection.

Alerts and Screen Effects intentionally have different matching, replay, and admission rules and separate queues. Their completion machinery has similar responsibilities, but this audit does not justify a generic queue base class. Small occurrence/recipient primitives are safer candidates after parity tests establish common behavior.

Desktop worker, main-process, preload, and renderer separation enforces privilege and lifecycle boundaries. Audio and visual transports have different leases, identities, transfer limits, and completion semantics. Their extra layers are not automatically redundant. Historical migrations, compatibility projections, and secret-store test seams must not be removed merely because current creation paths use newer contracts.

## Resolution Status

All twelve findings were resolved on September 23, 2026. The implementation removed a net 307 non-test production source lines across `apps/server/src`, `apps/web/src`, and `packages/core/src`, excluding stories and test support. The result is smaller than the audit's approximate 400-line deletion estimate because the ownership fixes added focused services, readiness retry handling, and the preview controller while deleting broader mixed-responsibility code.

| Finding | Resolution |
| --- | --- |
| R1 | `135c177` introduced the single core `buildAlertLayerInstruction` projector used by live resolution and editor tests while retaining their distinct selection and destination policy. |
| R2 | `83d324c` moved shared output readiness and Screen Effect eligibility into focused services. Home now polls only while an event source is starting or reconnecting, keeps the last summary and shows an actionable stale-status error if refresh fails, and stops polling when the source becomes healthy or blocked. |
| R3 | `75b9640` moved clocks, timers, media preparation, audio, object URLs, speech, cancellation, and disposal into `AlertPreviewController` behind a thin React subscription hook. |
| R4 | `8a23da7` split management routes into narrow domain registrars and reduced the concrete service to overview/provider composition; `eed958d` replaced the partial production dependency bag and runtime type predicates with an explicit `ProductionServerAppDependencies` assembly. `app.ts`, runtime composition, the former route façade, and `AlertEditorPage` are 352, 158, 704, and 167 lines smaller respectively than the audited versions before their focused replacements are counted. |
| R5 | `e6c7e0d` routed asset upload/download through the shared authenticated management transport and the core asset record, preserving binary handling and structured errors. |
| R6 | `16eb8ee` changed route fixtures to the production origin, bearer-session, and CSRF pre-handler and removed the obsolete bearer-only gate; `66034a2` covered the asset-impact request header through the production CORS path. |
| R7 | `ebfc9f0` removed the unused logger implementation and retained `RuntimeJsonlLogger` as the sole runtime writer. |
| R8 | `e86c1e4` removed the mandatory no-op transcoder seam; validated bytes now proceed directly to metadata probing and storage. |
| R9 | `ebfc9f0` removed the disconnected canvas-fit and editor arrow-movement implementations while retaining production behavior coverage. |
| R10 | `c3c6e28` added one own-property path reader and one overlay route-parameter module used by both prior consumers. |
| R11 | `d45357a` split the browser bootstrap into route-specific dynamic graphs and added gzip budgets. The final gate combines the Vite manifest with a build-emitted Rollup chunk-module inventory and follows route-owned static and dynamic imports, so folded or lazy management/editor imports cannot evade route-boundary checks. Current totals are 67.35 KiB bootstrap, 121.15 KiB overlay, 120.38 KiB operator, and 216.70 KiB management; `e38a192` made the surface own its overlay stylesheet after Storybook exposed the isolated-render dependency. |
| R12 | `ebfc9f0` removed the unused direct web `tslib` declaration and its lockfile entry. |

The completion search confirms one Alert layer projector, one shared management transport, one production management security pre-handler, one runtime logger, explicit production server dependencies, one disposable Alert preview owner, one shared own-property reader, one shared overlay-parameter module, and route-isolated web bundles. The removed transcoder, disconnected geometry helpers, legacy management façade, bearer-only security gate, and direct web `tslib` declaration have no source or manifest references.

### Resolution Verification

| Check | Result |
| --- | --- |
| Locked dependency installation | Passed, lockfile already current |
| `corepack.cmd pnpm lint` | Passed |
| `corepack.cmd pnpm typecheck` | Passed |
| `corepack.cmd pnpm test` | Passed: 249 Vitest files, 2,146 tests; 14 additional Node script tests |
| `corepack.cmd pnpm build` | Passed, including the four route bundle budgets above |
| `corepack.cmd pnpm build-storybook` | Passed; Storybook tool-bundle advisories remain outside the production route budgets |
| `corepack.cmd pnpm test:storybook:ci` | Passed: 23 suites, 239 tests; the deprecated Story Store warning remains tracked as BL-035 |
| `corepack.cmd pnpm test:e2e` with `CI=true` | Passed: 52 Chromium tests: 51 workflows against the test-owned Vite server plus a production Fastify-shell smoke test for hashed route chunks and CSS |
| Strict OpenSpec validation | Passed: 44/44 items |
| Current `origin/main` ancestry | Passed: the remediation branch remains a clean descendant of `fec768c58a8b27a6921e87ea1ac8d4a346a8c05d` after a final fetch |

## Documentation Reconciliation

The original canonical OpenSpec validation passed despite missing completed behavior: structural validity alone did not establish alignment with source. This audit corrects the following documentation drift:

| Drift | Correction |
| --- | --- |
| AGENTS/README described desktop as deferred and omitted the desktop package/current modules | Added current package/output boundaries and linked the operational runbook |
| Five completed changes had unsynced requirements | Added 30 requirements and updated three existing requirements across 11 capabilities; the sixth completed change was already synced and its later refinements were preserved |
| Screen Effects described default/weighted kinds, per-effect cooldown, animation settings, and unconditional watchdog release | Aligned to current weighting, event-owned cooldown, animation removal, and stop-failure retry behavior; documented draft variant removal |
| Event-group and navigation requirements predated later UI work | Reconciled unused-event disclosure and current Screen Effects navigation |
| Runbook named removed Diagnostics controls, Live Test, a generic module-config UI, and outdated CI/host behavior | Updated current labels, manual refresh and export behavior, API/UI boundaries, test setup, and marked the old Linux workaround historical |
| Product questions and future-wizard trigger were stale | Recorded implemented importer/moderation/desktop choices and the reached two-module trigger without promoting a new wizard |
| Backlog referenced completed IDs and a nonexistent changelog, and omitted two active proposals | Replaced stale prerequisite IDs with implemented capabilities and indexed the existing changelog/shoutout proposals without claiming implementation |
| Design/UI guidance described the old shell and obsolete typography | Updated navigation and measured CSS token/heading guidance; marked old implementation/closure reports historical |
| Eleven canonical Purpose fields were archive placeholders; two archive-relative links were broken | Replaced purposes and corrected links without rewriting historical acceptance evidence |

The [documentation map](../README.md) identifies current authorities, completed-but-unarchived changes, and historical records. Archive moves and implementation-task checkboxes were not changed. Pending changelog and video-shoutout proposals were not synced into implemented capabilities.

## Original Audit Verification And Limits

| Check | Result |
| --- | --- |
| Locked dependency installation | Passed, lockfile unchanged |
| `corepack pnpm lint` | Passed |
| `corepack pnpm typecheck` | Passed |
| `corepack pnpm test` | Passed: 242 Vitest files, 2,116 tests; nine additional Node script tests |
| `corepack pnpm build` | Passed; browser entry-size advisory remains as R11 |
| `corepack pnpm build-storybook` | Passed; tool-bundle size advisories remain |
| `corepack pnpm test:storybook:ci` | Passed: 23 suites, 238 tests; deprecated Story Store warning remains tracked as BL-035 |
| `corepack pnpm test:e2e` with `CI=true` | Passed: 50 Chromium tests using the test-owned Vite server |
| Strict OpenSpec validation | Passed: 44/44 items (eight changes and 36 canonical specifications) after synchronization |
| Markdown file targets and Git whitespace | Passed: no broken relative file targets across 388 Markdown files; `git diff --check` clean |

Initial sandboxed Corepack checks failed before running because the sandbox could not read the user's Corepack cache. The same commands passed with authorized cache access; those startup failures were environmental, not repository regressions.

The original audit commit changed no application code, dependencies, data, credentials, live provider connections, or saved output routes. Browser tests and runtime smoke tests provide automated evidence, not a fresh physical-device or OBS acceptance pass. Native packaging/hardware tests, external-link availability, GitHub-hosted security findings, and unresolved BL-044 native shutdown causality were not reverified. This audit is not a penetration test or a proof that all historical specification promises are implemented.
