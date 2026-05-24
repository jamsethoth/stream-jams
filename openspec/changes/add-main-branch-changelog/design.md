# Design: Add Main Branch Changelog

## Technical Approach

Add a source-controlled `CHANGELOG.md` and require pull requests targeting `main` to update it before merge. A small validation script will compare the pull request branch with its target branch, decide whether a changelog entry is required, and verify that newly added changelog lines represent the relevant commits.

The validation should run in GitHub Actions for pull requests to `main`. A second workflow path can run on pushes to `main` to detect invariant breaks after merges.

## Architecture Decisions

### Decision: Reviewable changelog updates

Changelog updates should be part of the pull request being merged. This keeps the change history reviewable and avoids a bot needing permission to bypass branch protection by committing directly to `main`.

### Decision: Commit representation instead of generated release notes

The changelog is a repository file, not only a GitHub release note or workflow artifact. This makes the history available from any clone and keeps it tied to the source state of `main`.

### Decision: Lightweight validation script

Use a small repository script instead of introducing a release-management dependency. The repository is still in planning/bootstrap state, so a shell script or minimal Node script is enough. The implementation should prefer the repo's eventual tooling if a package manager and runtime are already established by the time this change is applied.

### Decision: Documented exemptions

Some changes should not require changelog entries, such as mechanical changelog-only edits, dependency lockfile refreshes with no behavior change, or repository metadata changes that maintainers explicitly classify as exempt. Exemptions should be narrow and documented beside the validation logic.

## Data Flow

```text
Pull request targeting main
        |
        v
GitHub Actions checkout with full history
        |
        v
Validation script compares merge base to HEAD
        |
        v
Identify non-merge, non-bot commits and changed files
        |
        v
If non-exempt changes exist:
  - require CHANGELOG.md in the diff
  - require added changelog lines to represent the commit set
        |
        v
Pass or fail the required check
```

## File Changes

- `CHANGELOG.md` (new): Main branch changelog with initial format and baseline entries.
- `scripts/validate-changelog.*` (new): Validation script for pull requests and main branch checks.
- `.github/workflows/changelog.yml` (new): Pull request and optional main branch validation workflow.
- Repository documentation (new or existing): Contributor-facing rules for changelog entries and exemptions.

## Validation Details

The script should accept the target ref and head ref or infer them from GitHub Actions environment variables. It should:

- Compute the merge base for the pull request.
- List non-merge commits in the pull request range.
- Ignore bot commits and documented exempt-only changes.
- Inspect the diff to confirm `CHANGELOG.md` changed when required.
- Inspect added `CHANGELOG.md` lines and verify they include either each commit short SHA or a documented grouped pull request entry that lists the short SHA set.
- Print actionable failure messages with the missing commit identifiers.

For push validation on `main`, the workflow can compare the previous and current main branch SHA supplied by GitHub Actions and run the same invariant check against the resulting commit range.

## Risks

- If the repository later switches to squash-only merges, pre-merge commit SHAs will differ from the final commit SHA on `main`. The changelog policy should then allow PR-number traceability plus final squash commit validation on the post-merge workflow.
- Branch protection may require adding the changelog workflow as a required status check once the workflow exists.
- Very strict per-commit entries can become noisy. Grouped pull request entries are allowed to keep the changelog readable while still representing each commit.
