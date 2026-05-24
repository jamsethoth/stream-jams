# Tasks

## 1. Changelog Format

- [ ] 1.1 Add root `CHANGELOG.md` with a `Main Branch` or `Unreleased` section.
- [ ] 1.2 Define categories for changelog entries, such as Added, Changed, Fixed, Security, Docs, Tooling, and Chore.
- [ ] 1.3 Add traceability guidance for pull request numbers and commit short SHA(s).
- [ ] 1.4 Add an initial baseline entry for existing project history or clearly mark the changelog start point.

## 2. Validation Script

- [ ] 2.1 Add a script that computes the commit range for a pull request targeting `main`.
- [ ] 2.2 Detect non-merge, non-bot commits in the range.
- [ ] 2.3 Detect exempt-only changes according to documented exemption rules.
- [ ] 2.4 Fail when changelog-required changes do not modify `CHANGELOG.md`.
- [ ] 2.5 Fail when added changelog lines do not represent every required commit.
- [ ] 2.6 Print concise, actionable validation errors.

## 3. GitHub Actions

- [ ] 3.1 Add a workflow that runs changelog validation on pull requests targeting `main`.
- [ ] 3.2 Add a workflow path that checks the changelog invariant on pushes to `main`.
- [ ] 3.3 Keep workflow token permissions read-only unless a future task requires more.
- [ ] 3.4 Document the workflow as a branch protection required check once it exists.

## 4. Documentation

- [ ] 4.1 Document when contributors must add changelog entries.
- [ ] 4.2 Document the allowed grouped-entry format for pull requests with multiple commits.
- [ ] 4.3 Document narrow changelog exemptions.
- [ ] 4.4 Include an example entry for a normal pull request.

## 5. Verification

- [ ] 5.1 Add tests or scripted fixtures for required changelog updates, missing entries, grouped entries, and exempt-only changes.
- [ ] 5.2 Run the changelog validation locally against fixture ranges.
- [ ] 5.3 Run the repository validation workflow or equivalent local checks.
- [ ] 5.4 Confirm `git status` only shows the intended proposal artifacts and implementation files.
