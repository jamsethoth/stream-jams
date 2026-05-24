# Proposal: Add Main Branch Changelog

## Intent

The repository should keep a human-readable changelog for the `main` branch so maintainers can understand what has landed without reconstructing history from `git log` or GitHub pull requests. Every non-merge, non-bot commit that enters `main` should be represented in that changelog.

## Scope

In scope:

- Add a root `CHANGELOG.md` that records changes entering `main`.
- Define a stable changelog entry format for merged pull requests and direct commits, if direct commits ever occur.
- Require each non-merge, non-bot commit merged into `main` to be represented either by its own entry or by a grouped pull request entry that lists the included commit short SHA(s).
- Add automated validation for pull requests targeting `main` so relevant changes cannot merge without a changelog update.
- Document exemptions for changes that do not need changelog entries.

Out of scope:

- Publishing GitHub releases.
- Semantic versioning policy.
- Automatically committing generated changelog updates back to protected `main`.
- Rewriting the full historical project narrative before this policy exists, beyond an initial baseline section if useful.

## Approach

Use a source-controlled `CHANGELOG.md` that is updated inside the same pull request as the work being merged. Add a validation script and GitHub Actions workflow that compare a pull request against its target branch, identify non-exempt commits and file changes, and require the changelog diff to represent the commit set.

This keeps the changelog update reviewable, avoids workflow permissions that push directly to `main`, and fits the repository's branch-protection-first workflow.

## Impact

- Contributors will add or update `CHANGELOG.md` as part of pull requests that affect project history.
- Pull request checks will fail when a changelog-required change omits the changelog update.
- Maintainers get a reliable `main` branch change history without depending on GitHub UI state.
