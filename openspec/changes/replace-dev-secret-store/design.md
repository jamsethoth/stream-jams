# Design: Replace Dev Secret Store

## Context

The core `SecretStore` contract and an `OsSecretStore` wrapper already exist, but runtime startup still constructs `DevSecretStore` directly. This causes connected Twitch tokens to disappear across restart and leaves the app without a hardened production-mode decision. The implementation needs to be cross-platform, local-first, and explicit about unsupported credential-store environments.

## Goals / Non-Goals

**Goals:**

- Select a durable secret store during runtime startup for real local app usage.
- Keep token secret material out of SQLite, config files, browser bundles, overlay URLs, logs, and diagnostics exports.
- Preserve testability with fake credential adapters.
- Fail with actionable diagnostics when no supported credential store is available.
- Document Windows, macOS, and Linux behavior.

**Non-Goals:**

- Do not build cloud secret sync.
- Do not introduce Electron OS credential APIs until Electron packaging exists.
- Do not silently fall back to plaintext files for production secrets.
- Do not require real Twitch network calls in automated tests.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` has landed in remote `main`. The implementation must rebase on that runtime composition before editing startup wiring.

## Assumptions

- `SecretStore` remains the only interface Twitch OAuth/EventSub code uses for secret material.
- Development/test modes may keep deterministic in-memory stores when explicitly selected.
- A platform credential dependency or adapter may be needed; if added, it must be justified in the PR and pinned exactly.

## Decisions

- Add a runtime secret-store factory instead of constructing secret stores inline in `index.ts`. This keeps startup readable and gives tests a narrow seam.
- Require explicit mode selection for development-only stores. Production/local-app mode must choose OS credential storage or fail closed.
- Store only stable secret references in SQLite account metadata, not token values.
- Add restart-style tests that connect a fake account, recreate the runtime over the same metadata store and credential adapter, and verify EventSub can retrieve the access token.

## Initial Implementation Plan

1. Confirm app-shell runtime composition has landed in remote `main`.
2. Add a platform credential adapter decision for Windows, macOS, and Linux.
3. Add a secret-store factory with explicit development/test/production modes.
4. Wire Twitch OAuth and EventSub through the factory.
5. Add restart, redaction, and fail-closed tests.
6. Update runbook and final-review docs.

## Risks / Trade-offs

- Native credential dependencies can complicate installation. Mitigation: choose the smallest maintained dependency or platform command adapter and document trade-offs.
- Linux desktop credential stores vary by environment. Mitigation: detect unsupported environments and fail with clear setup instructions rather than storing plaintext.
- Failing closed can block local testing if defaults are too strict. Mitigation: keep explicit development mode available for non-production local testing.

## Open Questions

1. Which OS credential adapter should be preferred for Node runtime: a maintained npm package, platform command wrappers, or a small native adapter?
2. Should the default `pnpm dev` mode use durable OS secrets, or should it require an explicit environment flag to exercise production-like secret storage?
3. What user-facing message should appear when Linux Secret Service/libsecret is unavailable?
