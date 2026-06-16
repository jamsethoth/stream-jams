# Design: Replace Dev Secret Store

## Context

The core `SecretStore` contract and an `OsSecretStore` wrapper already exist, but runtime startup still constructs `DevSecretStore` directly. This causes connected Twitch tokens to disappear across restart and leaves the app without a hardened production-mode decision. The implementation needs to be cross-platform, local-first, and explicit about unsupported credential-store environments.

## Goals / Non-Goals

**Goals:**

- Select a durable secret store during runtime startup for real local app usage.
- Preserve dev/prod parity by using the same durable OS-backed secret-store path for normal `pnpm dev` and production/local-app startup.
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
- Normal development runtime should exercise the same durable secret-store path as production/local-app runtime.
- In-memory or fake stores remain available only through explicit test injection and must not be selected by the default developer runtime.
- A maintained platform credential dependency is the preferred implementation path, behind `OsCredentialAdapter`; if added, it must be justified in the PR and pinned exactly.

## Decisions

- Select `@napi-rs/keyring@1.3.0` as the Node runtime credential adapter dependency. It is pinned exactly, supports Windows Credential Manager, macOS Keychain, and Linux Secret Service/libsecret through native bindings, and is smaller/currenter than the evaluated alternatives.
- Add a runtime secret-store factory instead of constructing secret stores inline in `index.ts`. This keeps startup readable and gives tests a narrow seam.
- Require normal development and production/local-app modes to choose OS credential storage through the same factory path.
- Keep in-memory/fake stores outside default runtime selection; tests may inject them explicitly.
- When the OS credential adapter is unavailable, startup should expose a non-secret credential-store health warning while Twitch OAuth and token storage fail closed.
- Store only stable secret references in SQLite account metadata, not token values.
- Add restart-style tests that connect a fake account, recreate the runtime over the same metadata store and credential adapter, and verify EventSub can retrieve the access token.
- Use this user-facing unavailable-store message: `Credential store is unavailable. Configure Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret before connecting Twitch.`

## Initial Implementation Plan

1. Confirm app-shell runtime composition has landed in remote `main`.
2. Add a maintained platform credential adapter decision for Windows, macOS, and Linux.
3. Add a secret-store factory with dev/prod parity for normal runtime modes and explicit test injection seams.
4. Wire Twitch OAuth and EventSub through the factory.
5. Add restart, redaction, dev/prod parity, and fail-closed tests.
6. Update runbook and final-review docs.

## Risks / Trade-offs

- Native credential dependencies can complicate installation. Mitigation: choose the smallest maintained dependency that provides Windows, macOS, and Linux support behind the existing adapter interface, pin it exactly, and document trade-offs.
- Linux desktop credential stores vary by environment. Mitigation: detect unsupported environments, keep unrelated local app features available, and disable Twitch OAuth/token operations with clear setup instructions rather than storing plaintext.
- Dev/prod parity can expose keychain prompts or Linux credential-store setup during normal development. Mitigation: make credential-store health visible and keep deterministic fake stores available only for explicit tests.

## Resolved Questions

1. `@napi-rs/keyring@1.3.0` is the selected adapter. `keytar` was rejected because its package maintenance is stale, and `keychain` was rejected because it does not cover all target platforms.
2. Unsupported credential storage uses the cross-platform unavailable-store message above. The runtime stays available, diagnostics report non-secret degraded health, and Twitch OAuth/token operations fail closed without plaintext fallback.

No open questions remain for this change.
