# Stream Jams Slice 11 Alert Matching And Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 11 by converting normalized stream events and active alert rules into deterministic alert matches, selecting enabled variants, rendering safe templates, and producing overlay-ready resolved alert instructions without raw provider payloads.

**Architecture:** Keep alert matching, condition evaluation, template rendering, and alert resolution in `@stream-jams/core`. The matching engine receives already-active rules from Slice 10 service boundaries; it must not know about Twitch APIs, SQLite, Fastify, React, playback queue transport, or provider payloads.

**Tech Stack:** TypeScript, Zod-backed domain types, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 11.

Slice 11 required behavior:

- Implement condition evaluation for exact, minimum, maximum, range, tier, tenure, gift count, raid viewers, cheer amount, and channel point reward.
- Implement `AlertMatcher.findMatches`.
- Implement variant selection by condition, priority, and weighted random selection.
- Implement template rendering with event variables.
- Implement HTML escaping for rendered alert text by default.
- Unit test multiple matching alerts for one event.
- Unit test duplicate suppression for rules present in multiple active collections.
- Unit test template rendering and escaping.

Acceptance checks:

- Matching is deterministic except where weighted random selection is explicitly configured.
- The matcher returns all active matching alerts.
- Alert resolution returns overlay-ready instructions without raw provider payloads.

Non-goals:

- Playback queue behavior; Slice 12 owns queueing.
- Provider ingestion and Twitch raw payload normalization; Slices 17 and 18 own provider integration.
- Moderation beyond default HTML escaping; Slice 15 owns broader moderation safeguards.
- Management UI changes; Slice 14 owns full shell workflows.

## Baseline Evidence

- `origin/main` includes Slice 10 at `551dee3`.
- Branch `codex/slice-11-alert-matching` was created from fresh `origin/main`.
- Alert rules, variants, conditions, overlay instructions, playback resolved-alert types, and normalized event types already exist in `@stream-jams/core`.
- There is no existing `packages/core/src/templates` directory; Slice 11 creates it.

## File Ownership

- Create `packages/core/src/alerts/condition-evaluator.ts` and tests.
- Create `packages/core/src/alerts/alert-matcher.ts` and tests.
- Create `packages/core/src/alerts/alert-resolver.ts` and tests.
- Create `packages/core/src/templates/template-renderer.ts` and tests.
- Modify `packages/core/src/index.ts` to export Slice 11 APIs.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` after validation to mark Slice 11 complete.
- Update this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 11.1: Template Rendering

**Objective:** Render event variables into alert text safely.

**Expected files or areas touched:**

- `packages/core/src/templates/template-renderer.ts`
- `packages/core/src/templates/template-renderer.test.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing tests for dot-path variable replacement.
- [x] Write failing tests for unknown variables rendering as empty text.
- [x] Write failing tests for default HTML escaping.
- [x] Implement `DefaultTemplateRenderer` with optional escaping override.
- [x] Run focused tests and confirm they pass. Evidence: `pnpm test -- packages/core/src/templates/template-renderer.test.ts` passed (51 files, 186 tests).

**Positive test cases:**

- `{actor.displayName}`, `{amount}`, `{tier}`, `{rewardTitle}`, and metadata fields render from normalized events.

**Negative test cases:**

- Unknown paths render empty strings instead of leaking object text.
- HTML-like viewer text is escaped by default.

**Validation commands:**

- `pnpm test -- packages/core/src/templates/template-renderer.test.ts`

**Acceptance criteria:**

- Rendered text defaults to escaped output and does not contain raw provider payloads.

## Sub-Slice 11.2: Condition Evaluator

**Objective:** Evaluate alert rule conditions against normalized event fields.

**Expected files or areas touched:**

- `packages/core/src/alerts/condition-evaluator.ts`
- `packages/core/src/alerts/condition-evaluator.test.ts`

**Implementation steps:**

- [x] Write failing tests for exact equality, includes, minimum, maximum, and range operators.
- [x] Write failing tests for tier, tenure/streak, gift count metadata, raid viewer amount, cheer amount, and channel point reward fields.
- [x] Write failing tests for missing/non-numeric fields returning false.
- [x] Implement dot-path and alias-aware condition evaluation.
- [x] Run focused tests and confirm they pass. Evidence: `pnpm test -- packages/core/src/alerts/condition-evaluator.test.ts` passed (49 files, 178 tests).

**Positive test cases:**

- Numeric amount conditions work for cheer and raid events.
- Subscription tier and resubscription streak conditions work.
- Channel point reward conditions work by reward ID/title.

**Negative test cases:**

- Missing fields fail closed.
- Numeric operators do not coerce arbitrary strings.

**Validation commands:**

- `pnpm test -- packages/core/src/alerts/condition-evaluator.test.ts`

**Acceptance criteria:**

- Condition evaluation is pure, deterministic, and provider-agnostic.

## Sub-Slice 11.3: Alert Matcher

**Objective:** Return all active rules matching one normalized event, with duplicate suppression and deterministic ordering.

**Expected files or areas touched:**

- `packages/core/src/alerts/alert-matcher.ts`
- `packages/core/src/alerts/alert-matcher.test.ts`

**Implementation steps:**

- [x] Write failing matcher tests for multiple matching alerts for one event.
- [x] Write failing matcher tests for duplicate rule IDs appearing through multiple active collections.
- [x] Write failing matcher tests for disabled rules, mismatched event types, and failing conditions.
- [x] Implement `DefaultAlertMatcher.findMatches` using `DefaultAlertConditionEvaluator` by default.
- [x] Run focused tests and confirm they pass. Evidence: `pnpm test -- packages/core/src/alerts/alert-matcher.test.ts` passed (50 files, 181 tests).

**Positive test cases:**

- All active matching rules are returned.
- Results are sorted by priority descending, then rule ID for stable tie-breaking.

**Negative test cases:**

- Duplicate rule IDs appear at most once.
- Rules whose conditions fail are excluded.

**Validation commands:**

- `pnpm test -- packages/core/src/alerts/alert-matcher.test.ts`

**Acceptance criteria:**

- Matching remains deterministic and does not select variants or enqueue playback.

## Sub-Slice 11.4: Alert Resolver

**Objective:** Select variants and convert matches into overlay-ready `ResolvedAlert` instructions.

**Expected files or areas touched:**

- `packages/core/src/alerts/alert-resolver.ts`
- `packages/core/src/alerts/alert-resolver.test.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing resolver tests for priority-ordered matches producing overlay instructions.
- [x] Write failing resolver tests for weighted random enabled variant selection.
- [x] Write failing resolver tests proving disabled variants are ignored and all-disabled variants fail closed.
- [x] Write failing resolver tests proving output contains source event ID, rule ID, variant ID, rendered text, visual/audio/tts instructions, and no raw provider payload.
- [x] Implement resolver with injected random source, ID generator, template renderer, and optional visual asset media type lookup.
- [x] Run focused tests and confirm they pass. Evidence: `pnpm test -- packages/core/src/alerts/alert-resolver.test.ts` passed (51 files, 186 tests).

**Positive test cases:**

- Weighted variant selection uses injected random values and is deterministic in tests.
- Text and TTS templates are rendered with escaped event variables.

**Negative test cases:**

- Disabled variants are excluded from selection.
- Resolution fails closed when no enabled variants exist.

**Validation commands:**

- `pnpm test -- packages/core/src/alerts/alert-resolver.test.ts`

**Acceptance criteria:**

- Resolved alerts are serializable overlay instructions and do not expose raw provider payloads.

## Sub-Slice 11.5: Plan Reconciliation And Full Validation

**Objective:** Reconcile Slice 11 against the base MVP plan, run the standard validation suite, and prepare the PR packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-11-alert-matching.md`

**Implementation steps:**

- [x] Run architecture scans proving matcher/resolver code is core-only and does not import SQLite, Fastify, React, or provider adapters. Evidence: import-only scan for SQLite/Fastify/React/Twitch/server/web/Node imports returned no matches.
- [x] Update the base MVP plan Slice 11 checklist and completion evidence.
- [x] Update this detailed plan with validation evidence.
- [x] Run full validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`. Evidence: all commands passed; `pnpm test` reported 51 files and 186 tests.
- [x] Self-review the diff for scope creep and weak tests. Evidence: reviewed new matcher/evaluator/resolver/template files, tests, exports, `.env.example`, and plan diffs; added missing explicit tier/rewardTitle template coverage.
- [x] Commit with message `feat: add alert matching engine`.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 11 is implemented, tested, documented, and ready for PR review.

## Validation Evidence

- Template renderer focused validation: `pnpm test -- packages/core/src/templates/template-renderer.test.ts` passed (51 files, 186 tests).
- Condition evaluator focused validation: `pnpm test -- packages/core/src/alerts/condition-evaluator.test.ts` passed (49 files, 178 tests).
- Alert matcher focused validation: `pnpm test -- packages/core/src/alerts/alert-matcher.test.ts` passed (50 files, 181 tests).
- Alert resolver focused validation: `pnpm test -- packages/core/src/alerts/alert-resolver.test.ts` passed (51 files, 186 tests).
- Architecture import scan found no SQLite, Fastify, React, Twitch, server/web package, or Node runtime imports in the new Slice 11 core files.
- Full validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 files, 186 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
