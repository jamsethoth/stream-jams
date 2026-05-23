# Stream Jams GitHub Actions CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add required GitHub Actions CI gates so pull requests into `main` cannot merge unless the app installs deterministically, validations pass, the app builds successfully, and static security/code-quality scans complete successfully.

**Architecture:** Introduce stable required checks in `.github/workflows/ci.yml`: `validate` for lint/typecheck/tests, `build` for production build verification, `codeql` for static code security and quality analysis, and `dependency-review` for pull-request dependency risk checks. Add a separate non-blocking `.github/workflows/dependency-audit.yml` workflow that runs `pnpm audit` on a schedule and on manual dispatch so the existing vulnerability baseline is visible without blocking unrelated feature PRs. Repository protection is configured after the workflow exists so `main` requires all required CI checks before merge.

**Tech Stack:** GitHub Actions, Ubuntu hosted runners, Node.js 22, pnpm 9.15.0, Vite, TypeScript, ESLint, Vitest, CodeQL, Dependency Review Action, existing pnpm workspace scripts, GitHub branch protection.

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
- CodeQL supports JavaScript/TypeScript analysis through `github/codeql-action` and can run security and quality query suites.
- GitHub's Dependency Review Action can fail pull requests that introduce vulnerable dependencies.

## Scope Boundaries

### In Scope

- Add `.github/workflows/ci.yml`.
- Add `.github/workflows/dependency-audit.yml`.
- Run deterministic dependency installation with `pnpm install --frozen-lockfile`.
- Run every current validation script required for merge safety:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
- Run build as a separate required CI job:
  - `pnpm build`
- Run static code security and quality analysis:
  - CodeQL for JavaScript/TypeScript with `security-extended` and `security-and-quality` queries.
  - Dependency Review Action for pull requests that change dependencies.
- Run `pnpm audit` on a weekly schedule and manual dispatch as a non-required visibility workflow.
- Trigger CI for:
  - new PRs targeting `main`
  - commits pushed to branches with open PRs targeting `main`
  - reopened PRs
  - draft PRs becoming ready for review
  - merges/pushes to `main`
  - manual dispatch
- Configure `main` branch protection so `validate`, `build`, `codeql`, and `dependency-review` are required status checks before merge.
- Preserve existing repository protection defaults, including pull-request requirement, conversation resolution, no force pushes, and no branch deletion where already enabled or available.

### Out Of Scope

- Release packaging.
- Artifact upload.
- OS matrix builds.
- Browser E2E installation and Playwright browser caching. The current `test:e2e` script is a placeholder and should still run as part of CI.
- Deployment.
- Dependabot workflow changes.

### Best-Practice Decisions

- Use separate required jobs for validation, build, and scanning. This makes failures easier to triage and prevents build failures from being hidden inside a broad validation job.
- Use `pull_request`, not `pull_request_target`, to avoid granting elevated token permissions to untrusted PR code.
- Use least-privilege permissions. Default workflow permissions are `contents: read`; CodeQL receives `security-events: write`; dependency review receives `pull-requests: read`.
- Use `concurrency` to cancel older runs for the same PR or branch when newer commits arrive.
- Use `pnpm install --frozen-lockfile` so dependency changes must update `package.json` and `pnpm-lock.yaml` together.
- Cache the pnpm store through `actions/setup-node` using `cache: pnpm` and `cache-dependency-path: pnpm-lock.yaml`.
- Keep the CI workflow non-mutating. It must not commit, push, upload secrets, or write repository contents.
- Do not add `pnpm audit` as a required gate until the current dependency vulnerability baseline is triaged. Dependency Review should block newly introduced vulnerable dependencies without making unrelated PRs fail because of existing default-branch alerts.
- Run scheduled `pnpm audit` with `continue-on-error: true` at first. The job should always publish a human-readable summary and artifact so the team can track the baseline, then later switch to blocking after known high/critical issues are resolved or explicitly waived.

## Target File Structure

```text
.github/
  workflows/
    ci.yml
    dependency-audit.yml
docs/
  superpowers/
    plans/
      2026-05-21-stream-jams-mvp-first-pass.md
      2026-05-23-stream-jams-github-actions-ci-gate.md
```

## Task 1: Add CI Workflow

**Files:**

- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Create the workflow file**

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

  build:
    name: build
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

      - name: Build
        run: pnpm build

  codeql:
    name: codeql
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      actions: read
      contents: read
      security-events: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v4
        with:
          languages: javascript-typescript
          queries: security-extended,security-and-quality

      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@v4

  dependency-review:
    name: dependency-review
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      pull-requests: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Review dependency changes
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
```

- [x] **Step 2: Run local validation commands**

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
- Static analysis is verified in GitHub Actions because CodeQL and Dependency Review require GitHub code scanning/dependency review context.

- [x] **Step 3: Commit the workflow**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add required validation workflow"
```

## Task 2: Add Scheduled Dependency Audit

**Files:**

- Create: `.github/workflows/dependency-audit.yml`

- [x] **Step 1: Create the non-blocking dependency audit workflow**

Create `.github/workflows/dependency-audit.yml`:

```yaml
name: Dependency Audit

on:
  schedule:
    - cron: "23 9 * * 1"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  pnpm-audit:
    name: pnpm-audit
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true

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

      - name: Run pnpm audit
        id: audit
        run: pnpm audit --audit-level high --json > pnpm-audit.json
        continue-on-error: true

      - name: Write audit summary
        run: |
          {
            echo "## pnpm audit"
            echo
            echo "- Command: \`pnpm audit --audit-level high --json\`"
            echo "- Step outcome: \`${{ steps.audit.outcome }}\`"
            echo
            echo "This workflow is intentionally non-blocking until the current dependency vulnerability baseline is triaged."
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload audit report
        uses: actions/upload-artifact@v5
        with:
          name: pnpm-audit-report
          path: pnpm-audit.json
          if-no-files-found: error
```

- [x] **Step 2: Commit the dependency audit workflow**

Run:

```bash
git add .github/workflows/dependency-audit.yml
git commit -m "ci: add scheduled dependency audit"
```

## Task 3: Document The CI Gate In The MVP Plan

**Files:**

- Modify: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`

- [x] **Step 1: Add a cross-cutting CI gate note before Slice 3**

In `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, add this section after Slice 2 and before Slice 3:

```markdown
### Cross-Cutting Gate: GitHub Actions CI

**Category:** Repository quality and merge protection.

**Value:** Prevents unvalidated changes from merging into `main` before feature work continues.

**Files:**

- Create `.github/workflows/ci.yml`
- Create `.github/workflows/dependency-audit.yml`

**Steps:**

- [x] Add a GitHub Actions workflow with required `validate`, `build`, `codeql`, and `dependency-review` jobs.
- [x] Trigger the workflow on pull requests targeting `main`, new commits to open pull requests, pushes to `main`, and manual dispatch.
- [x] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` in `validate`.
- [x] Run `pnpm build` in a separate `build` job.
- [x] Run CodeQL JavaScript/TypeScript analysis with security and quality queries.
- [x] Run dependency review on pull requests and fail if a dependency change introduces high-severity or worse vulnerabilities.
- [x] Add a non-blocking scheduled dependency audit workflow that runs `pnpm audit --audit-level high` and uploads the audit report.
- [x] Configure `main` branch protection so all required CI checks must pass before merge.
- [x] Verify a pull request cannot merge while any required CI check is failing or pending.

**Acceptance Checks:**

- Every pull request targeting `main` gets `validate`, `build`, `codeql`, and `dependency-review` status checks.
- Every new commit pushed to a branch with an open pull request targeting `main` reruns required CI checks.
- Every merge or direct push to `main` runs `validate`, `build`, and `codeql`.
- `pnpm audit` runs on a weekly schedule and manual dispatch without blocking unrelated pull requests.
- `main` requires all required CI checks before pull requests can merge.
```

- [x] **Step 2: Commit the MVP plan update**

Run:

```bash
git add docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md
git commit -m "docs: add github actions ci gate to mvp plan"
```

## Task 4: Open The CI Pull Request

**Files:**

- No file edits.

- [x] **Step 1: Push the branch**

Run:

```bash
git push -u origin codex/github-actions-ci-gate
```

Expected:

- The branch exists on GitHub.

- [x] **Step 2: Create a draft PR**

Run:

```bash
gh pr create \
  --draft \
  --base main \
  --head codex/github-actions-ci-gate \
  --title "[codex] Add GitHub Actions CI gate" \
  --body "## Summary
- Adds a GitHub Actions CI workflow with required validate, build, CodeQL, and dependency-review jobs.
- Runs frozen install, lint, typecheck, unit tests, e2e placeholder, build, static code analysis, and dependency review.
- Adds non-blocking scheduled pnpm audit reporting for dependency vulnerability baseline tracking.
- Documents the CI gate in the MVP plan.

## Test Plan
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e
- pnpm build
- pnpm audit --audit-level high

## Follow-up
- After this workflow exists on GitHub, configure main branch protection to require validate, build, codeql, and dependency-review status checks."
```

Expected:

- A draft PR opens against `main`.
- GitHub starts the required `CI / validate`, `CI / build`, `CI / codeql`, and `CI / dependency-review` checks for the PR.

## Task 5: Configure Main Branch Protection

**Files:**

- No repository file edits.

**Important:** This task changes GitHub repository settings. Use escalated `gh` commands in this Codex environment because GitHub CLI authentication is stored in the OS keyring.

- [x] **Step 1: Verify GitHub authentication**

Run with escalated execution:

```bash
gh auth status
```

Expected:

- The active GitHub account is authenticated with repository permissions.

- [x] **Step 2: Confirm the PR check name**

Run with escalated execution after the PR check has started:

```bash
gh pr checks --watch
```

Expected:

- The check list includes `validate`, `build`, `codeql`, and `dependency-review`.
- All required checks pass.

- [x] **Step 3: Apply or update branch protection for `main`**

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
      "validate",
      "build",
      "codeql",
      "dependency-review"
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
- `main` requires pull requests and all required CI status checks before merge.

If GitHub returns that branch protection is unavailable because the repository is private and the account plan does not support it, stop and report the blocker. Do not change repository visibility unless the owner explicitly requests it after understanding the disclosure risk.

- [x] **Step 4: Verify branch protection**

Run with escalated execution:

```bash
gh api repos/jamsethoth/stream-jams/branches/main/protection
```

Expected response properties:

- `required_status_checks.contexts` contains `validate`, `build`, `codeql`, and `dependency-review`.
- `required_pull_request_reviews.required_approving_review_count` is `1`.
- `required_conversation_resolution.enabled` is `true`.
- `allow_force_pushes.enabled` is `false`.
- `allow_deletions.enabled` is `false`.

## Task 6: Prove Merge Blocking Works

**Files:**

- No repository file edits unless a temporary verification branch is used.

- [x] **Step 1: Verify the PR cannot merge before required checks pass**

Use the GitHub PR UI or run with escalated execution:

```bash
gh pr view --json mergeStateStatus,statusCheckRollup,reviewDecision
```

Expected:

- While any required check is pending or failing, the PR is not mergeable.
- After all required checks pass and review requirements are satisfied, the PR becomes mergeable.

- [x] **Step 2: Add final evidence to the PR**

Add a PR comment:

```bash
gh pr comment --body "CI gate verification:
- validate runs on pull requests targeting main.
- validate reruns on new commits to the PR branch.
- build runs separately from validation.
- codeql runs static code security and quality analysis.
- dependency-review blocks risky dependency changes on pull requests.
- pnpm-audit runs as non-blocking scheduled/manual visibility, not as a required PR gate.
- validate, build, and codeql run on pushes to main.
- main branch protection requires validate, build, codeql, and dependency-review before merge."
```

Expected:

- The PR contains a concise audit note showing that the gate is active.

## Acceptance Checks

- `.github/workflows/ci.yml` exists.
- `.github/workflows/dependency-audit.yml` exists.
- Workflow name is `CI`.
- Required job names are `validate`, `build`, `codeql`, and `dependency-review`.
- Workflow runs on pull requests targeting `main`.
- Workflow reruns on commits pushed to branches with open PRs targeting `main`.
- Workflow runs on pushes to `main`.
- Workflow can be run manually.
- Workflow token permissions are limited to `contents: read`.
- Workflow cancels superseded runs for the same PR or branch.
- Workflow uses pinned pnpm version `9.15.0`.
- Workflow runs `pnpm install --frozen-lockfile`.
- Workflow runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` in `validate`.
- Workflow runs `pnpm build` in `build`.
- Workflow runs CodeQL JavaScript/TypeScript analysis with security and quality queries.
- Workflow runs dependency review on pull requests.
- Dependency Audit workflow runs `pnpm audit --audit-level high` weekly and manually.
- Dependency Audit workflow is not required by branch protection until the vulnerability baseline is triaged.
- Dependency Audit workflow uploads `pnpm-audit.json` as an artifact.
- `main` branch protection requires `validate`, `build`, `codeql`, and `dependency-review` before merge.
- Branch protection still requires pull requests and conversation resolution.

## Execution Notes

- If GitHub reports required checks as `CI / validate`, `CI / build`, `CI / codeql`, or `CI / dependency-review` instead of the shorter job names in the branch protection UI, use the exact check contexts GitHub reports in `gh pr checks`.
- If `actions/checkout@v6`, `pnpm/action-setup@v6`, or `actions/setup-node@v6` requires a newer runner than GitHub-hosted `ubuntu-latest` provides, downgrade only the failing action to the newest supported major and document why in the PR.
- Do not use `pull_request_target` for this CI workflow.
- Do not add secrets to this workflow.
- Do not make `pnpm-audit` a required status check until the existing dependency vulnerability baseline is remediated or explicitly waived.
