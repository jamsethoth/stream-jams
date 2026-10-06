# Application error contracts

Use module-owned errors for meaningful outcomes and typed data. A high declaration count alone is not a reason to remove them. Keep HTTP translation at its owning server boundary and reconstruct browser errors from validated transport data; do not import server classes into the browser.

`NamedError` in core centralizes an explicit stable name and native `ErrorOptions.cause`. Pass a constant name, independent of constructor/minifier names. Existing named native subclasses can retain direct inheritance. The existing provenance gate resolves imported and indirect bases and requires stable naming. `SafeHttpError` in the server shares status/code/safe-message mechanics; inheriting it does not authorize automatic response disclosure. Explicit handlers still own which leaves/codes are exposed.

Retain specialized fields, constructor signatures and meaningful inheritance. For example, media capacity must be handled before generic media unavailability. Use one authoritative constructor for a local domain outcome: identically named constructors are different identities. Preserve bounded admission result unions instead of turning ordinary statuses into extra exceptions.

Across transport/realm boundaries, use module-owned codes and validate required payloads. Name-only objects and English message prefixes are not application error contracts. Unknown failures remain safely generic. Safe copy comes from bounded outcomes; never forward arbitrary provider messages into operator responses. Enrich caught exceptions with native causes where safe and let one owner record the diagnostic; adopt existing diagnostic references without duplicate logging.

Vendor compatibility is isolated: SQLite foreign-key failures use `ERR_SQLITE_ERROR` and extended code 787; Pear socket protocol/limit failures use documented locked ws codes. Pear deliberately discards raw socket exceptions that can contain credential-bearing URLs. The Zod adapter accepts local identity or a validated cross-realm issues shape; this vendor exception is not a general application name fallback. Version changes need adapter tests against the declared runtime/dependencies.

The subscription family deliberately retains historical diagnostic names per code. Historical logs are not rewritten and the exception transport schema is unchanged. The server and browser playback-conflict errors retain separate ownership and typed snapshots.

## October 2026 repair evidence

| Finding | Implementation and regression evidence |
| --- | --- |
| E1 duplicate Screen Effects constructor | `effect-errors.ts`; deterministic management/admission/Fastify tests in `screen-effects.test.ts` |
| E2 24 generic names | Explicit named constructors; 23 public serialization cases in `error-contracts.test.ts`; private CSS policy remains covered through its public validation tests and the naming gate |
| E3 repeated envelopes | Core NamedError and server SafeHttpError; payload/cause and unowned-disclosure regressions |
| E4 subscription leaves | Code-discriminated provider family; preserved route statuses/copy and legacy diagnostic names |
| E5 fragile dispatch | Typed reference/runtime outcomes, validated diagnostics/playback guards, SQLite/ws/Zod adapters and lookalike rejection tests |

Current delivery evidence is in `docs/verification/2026-10-05-error-taxonomy.md`. The full audited declaration baseline is in `openspec/changes/repair-error-taxonomy/audit-baseline.md`; reconcile against that list rather than a class-count target.
