# Complete Harden SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining active-rule temporary sorts, land the reconciled delivery record, then sync and archive `harden-sqlite-persistence` with no open tasks.

**Architecture:** Keep the existing four-statement active-rule reader and migration-013 indexes. Change only the parent SELECT so collection-first traversal supplies deterministic rule order without `DISTINCT` or temporary B-trees. Deliver that query fix first; after it reaches `main`, use a fresh branch to merge the five delta specs into main specs and archive the completed change.

**Tech Stack:** TypeScript 6, Node.js 24 `node:sqlite`, SQLite `EXPLAIN QUERY PLAN`, Vitest 4, pnpm 11, OpenSpec 1.4.

## Global Constraints

- Start each delivery branch from freshly fetched `origin/main`; do not reuse the merged PR #71 branch.
- Preserve the four-SELECT active-rule statement count and all event-type, enabled-rule, and active-collection behavior.
- Add no migration, index, dependency, repository abstraction, frontend change, WAL setting, or planner-maintenance behavior.
- Keep migrations 013 through 016 unchanged; migration 013 already has the required `(collection_id, rule_id)` index.
- Use the existing `EXPLAIN QUERY PLAN` style in `apps/server/src/modules/db/database.test.ts`.
- Do not sync or archive the OpenSpec change until the query-fix PR is present in `origin/main`.
- Storybook gates are not required because no frontend file changes.

## File Map

Query-fix PR:

- Modify `apps/server/src/modules/alerts/sqlite-alert-repository.ts`: rewrite only the `listActiveRules()` parent SELECT.
- Modify `apps/server/src/modules/db/database.test.ts`: prove the real parent-query shape uses the three existing indexes without a temporary B-tree.
- Modify `docs/audits/2026-07-20-sqlite-schema-query-index-audit.md`: record the required query finding as resolved with measured plan evidence.
- Modify `openspec/changes/harden-sqlite-persistence/tasks.md`: complete task 8.4 after focused and full verification.
- Retain the already-prepared reconciliation edits in `proposal.md`, `design.md`, and `tasks.md`.
- Add this implementation plan.

Sync/archive PR after the query-fix PR reaches `main`:

- Modify `openspec/specs/alert-configuration-management/spec.md`: merge the exactly-one-active-set requirement changes.
- Create `openspec/specs/configuration-backup-restore/spec.md`: promote the three backup/restore requirements.
- Modify `openspec/specs/overlay-output-management/spec.md`: add exact deterministic overlay-key verification.
- Modify `openspec/specs/runtime-log-operations/spec.md`: extend retention to relational diagnostics.
- Create `openspec/specs/sqlite-persistence-integrity/spec.md`: promote transaction, bounded-read, asset-FK, query-plan, and migration-ledger requirements.
- Move `openspec/changes/harden-sqlite-persistence/` to `openspec/changes/archive/2026-07-20-harden-sqlite-persistence/` through the OpenSpec archive command after sync and validation.

---

### Task 1: Commit The Reconciled Delivery Contract

**Files:**

- Modify: `openspec/changes/harden-sqlite-persistence/proposal.md`
- Modify: `openspec/changes/harden-sqlite-persistence/design.md`
- Modify: `openspec/changes/harden-sqlite-persistence/tasks.md`
- Create: `docs/superpowers/plans/2026-07-20-complete-harden-sqlite-persistence.md`

**Interfaces:**

- Consumes: merged PR #71 at `147a7b0a042f5388b1ff61117f13014e1fc314fc` and the approved consolidated-delivery decision.
- Produces: a strict-valid 43/45 OpenSpec change whose only pending tasks are 8.4 and 8.5.

- [ ] **Step 1: Confirm branch and artifact scope**

Run:

```powershell
git status --short --branch
git diff -- openspec/changes/harden-sqlite-persistence docs/superpowers/plans/2026-07-20-complete-harden-sqlite-persistence.md
```

Expected: branch `codex/reconcile-harden-sqlite-openspec`; only the three reconciled OpenSpec artifacts and this plan are changed.

- [ ] **Step 2: Validate the reconciled task model**

Run:

```powershell
openspec.cmd validate harden-sqlite-persistence --strict
openspec.cmd instructions apply --change harden-sqlite-persistence --json
git diff --check
```

Expected: strict validation passes; progress is 43/45; only tasks 8.4 and 8.5 are incomplete; diff check is empty.

- [ ] **Step 3: Commit the contract and plan**

```powershell
git add docs/superpowers/plans/2026-07-20-complete-harden-sqlite-persistence.md openspec/changes/harden-sqlite-persistence/proposal.md openspec/changes/harden-sqlite-persistence/design.md openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "docs(openspec): reconcile sqlite hardening delivery"
```

Expected: one documentation-only commit; clean worktree.

---

### Task 2: Add The Failing Active-Rule Plan Regression

**Files:**

- Test: `apps/server/src/modules/db/database.test.ts:101`

**Interfaces:**

- Consumes: `alert_collections_one_active_set`, `alert_rule_collections_collection_rule_idx`, and the `alert_rules` primary-key autoindex.
- Produces: a regression that fails while the parent query uses `DISTINCT` and `ORDER BY rules.id`.

- [ ] **Step 1: Extend the existing hot-alert plan test with the current parent query**

Add this plan capture beside `membershipPlan` and `variantPlan`:

```ts
const activeRulePlan = database.connection
  .prepare(
    `EXPLAIN QUERY PLAN
     SELECT DISTINCT rules.id, rules.name, rules.event_type, rules.enabled,
            rules.cooldown_seconds, rules.priority
     FROM alert_rules AS rules
     JOIN alert_rule_collections AS memberships ON memberships.rule_id = rules.id
     JOIN alert_collections AS collections ON collections.id = memberships.collection_id
     WHERE rules.enabled = 1
       AND collections.enabled = 1
       AND rules.event_type = ?
     ORDER BY rules.id`
  )
  .all("follow")
  .map((row) => String(row.detail));
```

Add these assertions:

```ts
const activeRulePlanText = activeRulePlan.join("\n");
expect(activeRulePlanText).toContain("alert_collections_one_active_set");
expect(activeRulePlanText).toContain("alert_rule_collections_collection_rule_idx");
expect(activeRulePlanText).toContain("sqlite_autoindex_alert_rules_1");
expect(activeRulePlanText).not.toContain("USE TEMP B-TREE");
```

- [ ] **Step 2: Run the focused test and confirm the reproduced failure**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts
```

Expected: FAIL because the plan contains `USE TEMP B-TREE FOR DISTINCT` and `USE TEMP B-TREE FOR ORDER BY`.

---

### Task 3: Rewrite The Parent Query Without A Migration

**Files:**

- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.ts:257`
- Modify: `apps/server/src/modules/db/database.test.ts:101`

**Interfaces:**

- Consumes: `listActiveRules(input?: { eventType?: StreamEventType })` and the existing child bulk-hydration statements.
- Produces: the same ordered `AlertRule[]` and four-SELECT count using collection-first indexed traversal.

- [ ] **Step 1: Replace only the parent SELECT in `listActiveRules()`**

Keep `eventFilter`, `parameters`, empty-result handling, and all three child queries unchanged. Replace the parent SQL with:

```ts
`SELECT rules.id, rules.name, rules.event_type, rules.enabled,
        rules.cooldown_seconds, rules.priority
 FROM alert_rule_collections AS memberships
 JOIN alert_rules AS rules ON rules.id = memberships.rule_id
 WHERE memberships.collection_id = (
   SELECT id FROM alert_collections WHERE enabled = 1
 )
   AND rules.enabled = 1
   ${eventFilter}
 ORDER BY memberships.rule_id`
```

- [ ] **Step 2: Update the representative plan SQL to the production shape**

Replace the failing plan query with:

```ts
const activeRulePlan = database.connection
  .prepare(
    `EXPLAIN QUERY PLAN
     SELECT rules.id, rules.name, rules.event_type, rules.enabled,
            rules.cooldown_seconds, rules.priority
     FROM alert_rule_collections AS memberships
     JOIN alert_rules AS rules ON rules.id = memberships.rule_id
     WHERE memberships.collection_id = (
       SELECT id FROM alert_collections WHERE enabled = 1
     )
       AND rules.enabled = 1
       AND rules.event_type = ?
     ORDER BY memberships.rule_id`
  )
  .all("follow")
  .map((row) => String(row.detail));
```

Keep all four index/no-temp assertions from Task 2.

- [ ] **Step 3: Run focused behavior and plan coverage**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/alerts/sqlite-alert-repository.test.ts packages/core/src/alerts/alert-service.test.ts
```

Expected: all tests pass; `listActiveRules()` remains four SELECTs for one and 100 rules; the parent plan uses the active-set, collection/rule, and rule-PK indexes with no temporary B-tree.

- [ ] **Step 4: Record resolution and complete OpenSpec task 8.4**

In `docs/audits/2026-07-20-sqlite-schema-query-index-audit.md`, change:

```markdown
### Required — Remove temporary B-trees from the active-rule parent query
```

to:

```markdown
### Resolved — Active-rule parent query avoids temporary B-trees
```

Append after the validation paragraph:

```markdown
**Resolution:** Collection-first traversal through the active-set scalar subquery uses the existing migration-013 covering index and rule PK without `DISTINCT` or temporary ordering. Focused plan and 1-versus-100-rule tests preserve the four-statement result contract.
```

Change task 8.4 in `openspec/changes/harden-sqlite-persistence/tasks.md` from `[ ]` to `[x]`.

- [ ] **Step 5: Revalidate the change and commit**

Run:

```powershell
openspec.cmd validate harden-sqlite-persistence --strict
openspec.cmd instructions apply --change harden-sqlite-persistence --json
git diff --check
```

Expected: strict validation passes; progress is 44/45 and only task 8.5 remains.

Commit:

```powershell
git add apps/server/src/modules/alerts/sqlite-alert-repository.ts apps/server/src/modules/db/database.test.ts docs/audits/2026-07-20-sqlite-schema-query-index-audit.md openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "perf(db): avoid active-rule temp sorts"
```

---

### Task 4: Verify And Land The Query-Fix PR

**Files:**

- Verify only; no planned file changes.

**Interfaces:**

- Consumes: the two commits from Tasks 1 and 3.
- Produces: task 8.4 present in remote `main`, which is the hard prerequisite for task 8.5.

- [ ] **Step 1: Run repository gates**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
openspec.cmd validate harden-sqlite-persistence --strict
git diff --check
```

Expected: every command exits 0. Record test-file/test counts in the PR description. Do not run Storybook locally because no frontend file changed.

- [ ] **Step 2: Push and open the query-fix PR**

```powershell
git push -u origin codex/reconcile-harden-sqlite-openspec
gh pr create --repo jamsethoth/stream-jams --base main --head codex/reconcile-harden-sqlite-openspec --title "perf(db): finish SQLite hardening reconciliation" --fill
$sqliteQueryPr = gh pr list --repo jamsethoth/stream-jams --head codex/reconcile-harden-sqlite-openspec --state open --json number --jq '.[0].number'
$sqliteQueryBody = @'
## Summary

- Reconcile the SQLite OpenSpec change with its approved consolidated delivery.
- Rewrite the active-rule parent query to avoid temporary DISTINCT and ordering B-trees.
- Add representative plan coverage and close task 8.4 without a migration.

## Validation

- `corepack.cmd pnpm lint`
- `corepack.cmd pnpm typecheck`
- `corepack.cmd pnpm test`
- `corepack.cmd pnpm build`
- `openspec.cmd validate harden-sqlite-persistence --strict`
'@
gh pr edit $sqliteQueryPr --repo jamsethoth/stream-jams --body $sqliteQueryBody
```

Update the validation list with the fresh test counts before requesting review.

- [ ] **Step 3: Require green CI and approval before merge**

Run:

```powershell
gh pr checks $sqliteQueryPr --repo jamsethoth/stream-jams --watch
```

Expected: validate, build, Storybook, e2e, dependency review, and CodeQL checks pass. Merge only after explicit user approval; admin bypass is not implied by approval given for PR #71.

- [ ] **Step 4: Confirm the merge before starting archive work**

```powershell
git fetch origin main
$sqliteQueryMerge = gh pr view $sqliteQueryPr --repo jamsethoth/stream-jams --json mergeCommit --jq '.mergeCommit.oid'
git merge-base --is-ancestor $sqliteQueryMerge origin/main
```

Expected: exit 0. If not, stop; task 8.5 must not start.

---

### Task 5: Sync Delta Specs Into Main Specs

**Files:**

- Modify: `openspec/specs/alert-configuration-management/spec.md`
- Create: `openspec/specs/configuration-backup-restore/spec.md`
- Modify: `openspec/specs/overlay-output-management/spec.md`
- Modify: `openspec/specs/runtime-log-operations/spec.md`
- Create: `openspec/specs/sqlite-persistence-integrity/spec.md`

**Interfaces:**

- Consumes: all five delta specs under `openspec/changes/harden-sqlite-persistence/specs/` and their corresponding main specs.
- Produces: idempotently merged main requirements with no lost pre-existing scenarios.

- [ ] **Step 1: Create a fresh post-merge branch**

```powershell
git fetch origin main
git switch -c codex/archive-harden-sqlite-persistence origin/main
openspec.cmd status --change harden-sqlite-persistence --json
openspec.cmd instructions apply --change harden-sqlite-persistence --json
```

Expected: task 8.4 is complete; task 8.5 is the only pending task.

- [ ] **Step 2: Merge the five delta capabilities using the OpenSpec sync workflow**

Apply this exact mapping:

| Capability | Main-spec result |
|---|---|
| `alert-configuration-management` | Replace only `Alert Collections Are Fully Managed` with the delta wording and its four scenarios; preserve every other alert-management requirement. |
| `configuration-backup-restore` | Create the main spec with a concise purpose plus all three delta requirements: ordered round trips, explicit legacy rejection, and non-portable credential state. |
| `overlay-output-management` | Append `Overlay Key Verification Is Exact And Deterministic` and its four scenarios; preserve all existing output-management requirements. |
| `runtime-log-operations` | Replace only `Log Level And Retention Are Configurable` with the delta wording and three scenarios; preserve structured logging, redaction, and diagnostics requirements. |
| `sqlite-persistence-integrity` | Create the main spec with a concise purpose plus all five delta requirements: transaction isolation, bounded active reads, variant asset FKs, indexed deterministic ordering, and exact-prefix migration ledgers. |

New spec headers must be:

```markdown
# configuration-backup-restore

## Purpose

Define lossless portable configuration backup and restore, explicit archive compatibility, and safe handling of credential-linked runtime state.

## Requirements
```

and:

```markdown
# sqlite-persistence-integrity

## Purpose

Define SQLite transaction, query, relational-integrity, ordering, and migration-ledger guarantees for Stream Jams persistence.

## Requirements
```

Under each `## Requirements`, copy every requirement and scenario from its delta spec without the `## ADDED Requirements` wrapper. For modified capabilities, replace only the named requirement block and keep unrelated blocks byte-for-byte unchanged.

- [ ] **Step 3: Check sync completeness and idempotency**

Run:

```powershell
rg -n "Requirement: Configuration Round Trips Preserve Ordered Alert State|Requirement: Lossy Legacy Archives Are Rejected Explicitly|Requirement: Credential-Linked Runtime State Is Not Portable|Requirement: Overlay Key Verification Is Exact And Deterministic|Requirement: SQLite Transactions Isolate Unrelated Operations|Requirement: Active Alert Reads Use Bounded SQL Statements|Requirement: Variant Asset References Are Relationally Enforced|Requirement: Hot Query Ordering Is Deterministic And Indexed|Requirement: Migration Ledger Is An Exact Known Prefix" openspec/specs
openspec.cmd validate --specs --strict
git diff --check
```

Expected: every listed requirement appears exactly once; all main specs validate; no whitespace errors. Re-applying the mapping would produce no diff.

---

### Task 6: Complete Task 8.5 And Archive The Change

**Files:**

- Modify before archive: `openspec/changes/harden-sqlite-persistence/tasks.md`
- Archive: `openspec/changes/harden-sqlite-persistence/` to the dated OpenSpec archive path.

**Interfaces:**

- Consumes: query-fix merge in `origin/main` and fully synced main specs from Task 5.
- Produces: no active `harden-sqlite-persistence` change and a strict-valid dated archive.

- [ ] **Step 1: Mark the final task complete and validate before moving it**

Change task 8.5 from `[ ]` to `[x]`, then run:

```powershell
openspec.cmd validate harden-sqlite-persistence --strict
openspec.cmd instructions apply --change harden-sqlite-persistence --json
```

Expected: strict validation passes and progress is 45/45 with state `all_done`.

- [ ] **Step 2: Archive without re-syncing the already merged specs**

First confirm the target does not exist:

```powershell
Test-Path openspec/changes/archive/2026-07-20-harden-sqlite-persistence
```

Expected: `False`.

Archive through the native CLI:

```powershell
openspec.cmd archive harden-sqlite-persistence --skip-specs -y
```

Expected: the active change moves to `openspec/changes/archive/2026-07-20-harden-sqlite-persistence/` with `.openspec.yaml`, proposal, design, specs, and completed tasks preserved.

- [ ] **Step 3: Verify the final OpenSpec repository state**

```powershell
openspec.cmd list --json
openspec.cmd validate --all --strict
git status --short
git diff --check
```

Expected: `harden-sqlite-persistence` is absent from active changes; all specs and changes validate; status contains only the five main-spec updates and the archived change move; diff check is empty.

- [ ] **Step 4: Commit the sync and archive**

```powershell
git add openspec/specs openspec/changes/archive/2026-07-20-harden-sqlite-persistence
git commit -m "docs(openspec): archive SQLite hardening"
```

- [ ] **Step 5: Publish the archive PR**

```powershell
git push -u origin codex/archive-harden-sqlite-persistence
gh pr create --repo jamsethoth/stream-jams --base main --head codex/archive-harden-sqlite-persistence --title "docs(openspec): archive SQLite hardening" --fill
$sqliteArchivePr = gh pr list --repo jamsethoth/stream-jams --head codex/archive-harden-sqlite-persistence --state open --json number --jq '.[0].number'
$sqliteArchiveBody = @'
## Summary

- Sync the five accepted SQLite hardening delta capabilities into main OpenSpec specs.
- Mark the final reconciliation task complete.
- Archive the 45/45 completed `harden-sqlite-persistence` change.

## Validation

- `openspec.cmd validate --specs --strict`
- `openspec.cmd validate --all --strict`
- `git diff --check`
'@
gh pr edit $sqliteArchivePr --repo jamsethoth/stream-jams --body $sqliteArchiveBody
gh pr checks $sqliteArchivePr --repo jamsethoth/stream-jams --watch
```

Expected: CI passes. Merge only after explicit user approval, then fetch `origin/main` and confirm the archive commit is an ancestor.

## Final Acceptance Checklist

- [ ] Active-rule retrieval returns the same ordered domain results and still executes four SELECTs for one and 100 rules.
- [ ] The active parent plan uses `alert_collections_one_active_set`, `alert_rule_collections_collection_rule_idx`, and the alert-rule PK with no `USE TEMP B-TREE`.
- [ ] No migration, index, dependency, public API, frontend, or database-policy change was added.
- [ ] Query-fix PR is present in `origin/main` before sync/archive begins.
- [ ] All five delta capabilities are represented exactly once in main specs without deleting unrelated scenarios.
- [ ] Archived tasks show 45/45 complete and the change is absent from `openspec.cmd list --json`.
- [ ] `openspec.cmd validate --all --strict` passes after archive.
