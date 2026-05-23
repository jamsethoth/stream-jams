# Stream Jams GitHub Actions CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required GitHub Actions CI gate so pull requests into `main` cannot merge unless the app installs deterministically, passes every validation script, and builds successfully.

**Architecture:** Introduce one stable required check named `validate` in `.github/workflows/ci.yml`. The job runs on pull requests targeting `main`, on every new commit pushed to an open PR branch through the `pull_request.synchronize` event, on pushes to `main` after merge, and manually through `workflow_dispatch`. Repository protection is configured after the workflow exists so `main` requires the `validate` status check before merge.

**Tech Stack:** GitHub Actions, Ubuntu hosted runners, Node.js 22, pnpm 9.15.0, Vite, TypeScript, ESLint, Vitest, existing pnpm workspace scripts, GitHub branch protection.

---

## Source Context

The MVP implementation plan does not currently define a GitHub Actions CI slice. This plan should be executed before the next feature slice so all future pull requests are protected by CI.

Current root scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @stream-jams/server --filter @stream-jams/web dev",
    "build": "pnpm -r build",
    "test": "pnpm test:unit",
    "test:unit": "vitest run",
    "test:e2e": "node -e \"console.log('Playwright e2e tests are introduced in a later slice.')\"",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck"
  },
  "packageManager": "pnpm@9.15.0"
}
```

GitHub references used for this plan:

- GitHub workflow syntax supports `pull_request`, `push`, branch filters, `permissions`, and `concurrency`.
- GitHub branch protection/rulesets can require status checks before merging.
- `actions/setup-node` supports pnpm dependency caching with `cache: pnpm` and recommends `contents: read` permissions.
- `pnpm/action-setup` installs pnpm and does not set up Node.js by itself.

## Scope Boundaries

### In Scope

- Add `.github/workflows/ci.yml`.
- Run deterministic dependency installation with `pnpm install --frozen-lockfile`.
- Run every current validation/build script required for merge safety:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm build`
- Trigger CI for:
  - new PRs targeting `main`
  - commits pushed to branches with open PRs targeting `main`
  - reopened PRs
  - draft PRs becoming ready for review
  - merges/pushes to `main`
  - manual dispatch
- Configure `main` branch protection so `validate` is a required status check before merge.
- Preserve existing repository protection defaults, including pull-request requirement, conversation resolution, no force pushes, and no branch deletion where already enabled or available.

### Out Of Scope

- Release packaging.
- Artifact upload.
- OS matrix builds.
- Browser E2E installation and Playwright browser caching. The current `test:e2e` script is a placeholder and should still run as part of CI.
- Deployment.
- Dependabot workflow changes.

### Best-Practice Decisions

- Use one required job named `validate` rather than many required checks. This keeps branch protection stable while still running all validations.
- Use `pull_request`, not `pull_request_target`, to avoid granting elevated token permissions to untrusted PR code.
- Use `permissions: contents: read` at workflow scope.
- Use `concurrency` to cancel older runs for the same PR or branch when newer commits arrive.
- Use `pnpm install --frozen-lockfile` so dependency changes must update `package.json` and `pnpm-lock.yaml` together.
- Cache the pnpm store through `actions/setup-node` using `cache: pnpm` and `cache-dependency-path: pnpm-lock.yaml`.
- Keep the CI workflow non-mutating. It must not commit, push, upload secrets, or write repository contents.

## Target File Structure

```text
.github/
  workflows/
    ci.yml
docs/
  superpowers/
    plans/
      2026-05-21-stream-jams-mvp-first-pass.md
      2026-05-23-stream-jams-github-actions-ci-gate.md
```

## Task 1: Add CI Workflow

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - reopened
      - synchronize
      - ready_for_review
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: validate
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Set up pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 9.15.0
          run_install: false

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: E2E placeholder
        run: pnpm test:e2e

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Run local validation commands**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected:

- Frozen install exits with status 0.
- ESLint exits with status 0.
- TypeScript exits with status 0 for every package.
- Vitest exits with status 0.
- `test:e2e` prints the placeholder Playwright message and exits with status 0.
- Build exits with status 0 for every package.

- [ ] **Step 3: Commit the workflow**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add required validation workflow"
```

## Task 2: Document The CI Gate In The MVP Plan

**Files:**

- Modify: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`

- [ ] **Step 1: Add a cross-cutting CI gate note before Slice 3**

In `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, add this section after Slice 2 and before Slice 3:

```markdown
### Cross-Cutting Gate: GitHub Actions CI

**Category:** Repository quality and merge protection.

**Value:** Prevents unvalidated changes from merging into `main` before feature work continues.

**Files:**

- Create `.github/workflows/ci.yml`

**Steps:**

- [ ] Add a GitHub Actions workflow with one required `validate` job.
- [ ] Trigger the workflow on pull requests targeting `main`, new commits to open pull requests, pushes to `main`, and manual dispatch.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- [ ] Configure `main` branch protection so the `validate` check must pass before merge.
- [ ] Verify a pull request cannot merge while the `validate` check is failing or pending.

**Acceptance Checks:**

- Every pull request targeting `main` gets a `validate` status check.
- Every new commit pushed to a branch with an open pull request targeting `main` reruns `validate`.
- Every merge or direct push to `main` runs `validate`.
- `main` requires the `validate` check before pull requests can merge.
```

- [ ] **Step 2: Commit the MVP plan update**

Run:

```bash
git add docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md
git commit -m "docs: add github actions ci gate to mvp plan"
```

## Task 3: Open The CI Pull Request

**Files:**

- No file edits.

- [ ] **Step 1: Push the branch**

Run:

```bash
git push -u origin codex/github-actions-ci-gate
```

Expected:

- The branch exists on GitHub.

- [ ] **Step 2: Create a draft PR**

Run:

```bash
gh pr create \
  --draft \
  --base main \
  --head codex/github-actions-ci-gate \
  --title "[codex] Add GitHub Actions CI gate" \
  --body "## Summary
- Adds a GitHub Actions CI workflow with one required validate job.
- Runs frozen install, lint, typecheck, unit tests, e2e placeholder, and build.
- Documents the CI gate in the MVP plan.

## Test Plan
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e
- pnpm build

## Follow-up
- After this workflow exists on GitHub, configure main branch protection to require the validate status check."
```

Expected:

- A draft PR opens against `main`.
- GitHub starts the `CI / validate` check for the PR.

## Task 4: Configure Main Branch Protection

**Files:**

- No repository file edits.

**Important:** This task changes GitHub repository settings. Use escalated `gh` commands in this Codex environment because GitHub CLI authentication is stored in the OS keyring.

- [ ] **Step 1: Verify GitHub authentication**

Run with escalated execution:

```bash
gh auth status
```

Expected:

- The active GitHub account is authenticated with repository permissions.

- [ ] **Step 2: Confirm the PR check name**

Run with escalated execution after the PR check has started:

```bash
gh pr checks --watch
```

Expected:

- The check list includes a job named `validate`.
- The check passes.

- [ ] **Step 3: Apply or update branch protection for `main`**

Run with escalated execution:

```bash
gh api \
  --method PUT \
  repos/jamsethoth/stream-jams/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "validate"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Expected:

- GitHub accepts the branch protection update.
- `main` requires pull requests and the `validate` status check before merge.

If GitHub returns that branch protection is unavailable because the repository is private and the account plan does not support it, stop and report the blocker. Do not change repository visibility unless the owner explicitly requests it after understanding the disclosure risk.

- [ ] **Step 4: Verify branch protection**

Run with escalated execution:

```bash
gh api repos/jamsethoth/stream-jams/branches/main/protection
```

Expected response properties:

- `required_status_checks.contexts` contains `validate`.
- `required_pull_request_reviews.required_approving_review_count` is `1`.
- `required_conversation_resolution.enabled` is `true`.
- `allow_force_pushes.enabled` is `false`.
- `allow_deletions.enabled` is `false`.

## Task 5: Prove Merge Blocking Works

**Files:**

- No repository file edits unless a temporary verification branch is used.

- [ ] **Step 1: Verify the PR cannot merge before required checks pass**

Use the GitHub PR UI or run with escalated execution:

```bash
gh pr view --json mergeStateStatus,statusCheckRollup,reviewDecision
```

Expected:

- While `validate` is pending or failing, the PR is not mergeable.
- After `validate` passes and review requirements are satisfied, the PR becomes mergeable.

- [ ] **Step 2: Add final evidence to the PR**

Add a PR comment:

```bash
gh pr comment --body "CI gate verification:
- validate runs on pull requests targeting main.
- validate reruns on new commits to the PR branch.
- validate runs on pushes to main.
- main branch protection requires validate before merge."
```

Expected:

- The PR contains a concise audit note showing that the gate is active.

## Acceptance Checks

- `.github/workflows/ci.yml` exists.
- Workflow name is `CI`.
- Required job name is `validate`.
- Workflow runs on pull requests targeting `main`.
- Workflow reruns on commits pushed to branches with open PRs targeting `main`.
- Workflow runs on pushes to `main`.
- Workflow can be run manually.
- Workflow token permissions are limited to `contents: read`.
- Workflow cancels superseded runs for the same PR or branch.
- Workflow uses pinned pnpm version `9.15.0`.
- Workflow runs `pnpm install --frozen-lockfile`.
- Workflow runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- `main` branch protection requires the `validate` status check before merge.
- Branch protection still requires pull requests and conversation resolution.

## Execution Notes

- If GitHub reports the required check as `CI / validate` instead of `validate` in the branch protection UI, use the exact check context GitHub reports in `gh pr checks`.
- If `actions/checkout@v6`, `pnpm/action-setup@v6`, or `actions/setup-node@v6` requires a newer runner than GitHub-hosted `ubuntu-latest` provides, downgrade only the failing action to the newest supported major and document why in the PR.
- Do not use `pull_request_target` for this CI workflow.
- Do not add secrets to this workflow.
