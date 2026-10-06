# Error taxonomy repair verification

October 5, 2026; isolated branch `codex/repair-error-taxonomy`, based on current `origin/main` (`ffb5f71`). Implementation scope is the five findings in the error-class audit, with the six slices specified by `repair-error-taxonomy`.

## Repairs

- E1: one authoritative missing-definition constructor; admission-time variant disappearance receives the existing safe conflict response.
- E2/E3: explicit names for all 24 affected declarations; browser-compatible NamedError and server SafeHttpError share mechanics while preserving leaf identities, payloads, standard causes and boundary disclosure ownership.
- E4: three payload-free subscription leaves become one family with preserved codes, safe responses and historical diagnostic names.
- E5: typed Screen Effects references and Streamer.bot runtime outcomes; validated diagnostics/playback payload guards; verified SQLite/ws classifiers and a bounded Zod compatibility adapter.
- The existing provenance gate now resolves cross-file inheritance and enforces stable diagnostic naming. The final production scan finds 101 error declarations, one missing-effect constructor and no obsolete subscription leaves. The count reflects new shared primitives/typed outcomes and is not a simplification target.

## Evidence

| Check | Result |
| --- | --- |
| Screen Effects management/admission/route regressions | 30 passed initially; final route cases 11 passed, including a schema-valid variant replacement |
| Foundations, public error serialization, existing serializer and private CSS policy behavior | 85 passed |
| Provider subscription family, management and route contracts | 44 passed |
| First-party references/runtime/diagnostics/playback regressions | 74 passed |
| Vendor adapters, Pear lifecycle and affected schema-validation routes | 83 passed |
| Naming/provenance checker fixtures | 11 passed |
| Production provenance enforcement and lint | Passed, including final refresh |
| Strict workspace typecheck | Passed, including the added real-runtime acceptance test |
| Server/web/desktop production build | Passed |
| Storybook build | Passed |
| Storybook interaction/accessibility gate | 335 passed across 38 suites |
| Screen Effects and provider browser acceptance | 6 passed |
| Real disposable HTTP runtime, reference rejection, persistence rollback and management reload | 1 passed |
| Full unit and script suite | 3,195 passed across 355 files; 117 script tests passed; command exited 0 |
| Independent implementation review | No actionable findings |
| Strict OpenSpec validation and whitespace check | Passed, including final refresh |

The real runtime test imports a tiny disposable image, verifies 404 missing definitions and 409 unavailable visual/sound/route references through real HTTP, confirms failed saves do not persist, then creates a valid effect and reloads the served management UI. The UI workflow also verifies a rejected live test remains recoverable. Deterministic between-read mutation is exercised through real management/admission classes and Fastify inject rather than browser timing sleeps.

The 23 public unnamed errors are constructed and serialized in consumer contract tests. Private PolicyError is caught internally and returns bounded CSS validation results; its name is enforced by the production AST gate without exporting a private class solely for a test. Existing CSS-policy tests retain the public behavior. No exception transport schema or historical logs were changed.

The broad run exposed a defect in the newly revised race fixture: an extra document field rejected by the strict schema. That fixture was corrected and all 11 route cases passed. Added real-runtime acceptance initially exposed fixture-only layout/upload/locator mistakes; they were corrected against the actual contracts. These are test defects, not weakened expectations or production response changes.

## Limits and delivery

All runtime/database/media work uses disposable fixtures and the installed manifest-declared Node 24.16.0 environment. No normal profile or credential was changed. No physical device/OBS acceptance is needed for these error-contract repairs. The review/builds/local tests do not establish remote CI status. Local verification was completed before the user requested publication of the branch; merging and archiving remain separate actions.

Non-failing existing output includes jsdom media-method limitations, Storybook Story Store deprecation and bundle-size warnings, and Playwright color-environment warnings. All six implementation slices and their verification gates are complete.
