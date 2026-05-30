# Stream Jams MVP Slice Autonomy Prompt

Use this prompt to continue autonomous MVP implementation work for the `stream-jams` project.

The goal is to process the remaining MVP slices in sequence with strong quality controls, independent review, committed slice specs, validated pull requests, and squash merges into `main`.

## Repository Context

You are working in the `stream-jams` repository.

Follow all repository and workspace instructions, including `AGENTS.md` when present. In this environment, GitHub CLI auth is stored in the OS keyring and is not reliably visible inside the Codex sandbox.

For any `gh` command that needs GitHub auth or network access, use escalated execution first. This includes:

- `gh auth status`
- `gh auth token`
- `gh repo ...`
- `gh pr ...`
- `gh issue ...`
- `gh api ...`

Do not ask the user to re-authenticate based only on non-escalated `gh` output. First verify with escalated `gh auth status`.

Do not use `gh auth refresh --insecure-storage` unless the user explicitly requests it.

## Operating Rules

Process one MVP slice at a time, starting with slice 7.

Do not begin the next slice until the current slice has been reviewed, squash merged into `origin/main`, and verified on the latest remote state.

Process slices strictly in sequence. Never work on multiple MVP slices in parallel.

Before each slice:

1. Fetch the latest remote state.
2. Confirm the current branch and worktree state.
3. Confirm the target slice is still unimplemented.
4. Create a fresh branch from `origin/main`.
5. Review the MVP documentation and any existing slice plans/specs.

Use a branch name like:

```text
mvp/slice-07-short-description
```

Stop for human input if the worktree contains unrelated local changes that would be affected by the slice work.

## Overall Slice Loop

For each unimplemented MVP slice starting with slice 7:

1. Fetch the latest remote state.
2. Confirm the slice is still unimplemented.
3. Create a fresh branch from `origin/main`.
4. Review the MVP documentation for that slice.
5. Create a slice-specific agentic implementation spec.
6. Commit the slice-specific spec to the branch.
7. Implement the slice according to that spec.
8. Add comprehensive tests.
9. Add or update Playwright tests when the slice changes browser-visible behavior.
10. Compare the MVP requirements and slice spec against the implementation.
11. Close all in-scope gaps.
12. Run validation.
13. Commit, push, and open a PR.
14. Run an independent review sub-agent on the PR.
15. Fix review findings if needed.
16. Repeat independent review until no actionable issues remain.
17. Squash merge the PR.
18. Verify `origin/main` contains the merged implementation, tests, and slice spec.
19. Continue to the next unimplemented slice.

## Slice Spec Requirement

The slice-specific implementation spec is a required deliverable for every slice.

The implementation sub-agent must commit the spec to the slice branch before or alongside the implementation. The spec must be included in the PR and merged into `main` with the slice implementation.

If the repository already has a convention for MVP slice specs, follow it. Otherwise, place specs under:

```text
docs/mvp/slice-specs/slice-XX-<short-title>.md
```

A slice PR must not be opened, reviewed, approved, or merged unless the slice-specific spec is included in the branch.

The slice-specific implementation spec must include:

- Slice number and title.
- Source MVP requirements.
- In-scope work.
- Explicit non-goals.
- Breakdown into small, well-scoped sub-slices.
- Expected code areas likely to change.
- Data model, API, UI, state, or persistence changes, if applicable.
- Error handling expectations.
- Security and privacy considerations.
- Unit test plan with positive and negative cases.
- Playwright test plan when UI behavior is affected.
- Validation commands to run.
- Acceptance criteria.

Before implementation, review the spec for:

- Placeholders such as `TBD` or `TODO`.
- Contradictions with the MVP documentation.
- Ambiguous acceptance criteria.
- Scope that is too broad for the slice.
- Missing validation expectations.

Fix spec issues before coding.

## Implementation Sub-Agent

For each slice, start a new implementation sub-agent.

The implementation sub-agent must:

1. Fetch latest remote state.
2. Create a new branch from `origin/main`.
3. Locate and review the MVP documentation for the target slice.
4. Create and commit the slice-specific implementation spec.
5. Implement the slice according to that spec.
6. Add tests.
7. Run a requirements-to-implementation gap review.
8. Fix all in-scope gaps.
9. Run validation.
10. Commit, push, and open a PR.

Use TypeScript best practices:

- Keep the solution simple and maintainable.
- Follow existing project architecture and style.
- Prefer small, well-encapsulated modules.
- Avoid unnecessary abstractions.
- Avoid unrelated refactors.
- Keep code unit testable.
- Use explicit types where they improve clarity.
- Validate data at service, API, WebSocket, persistence, and provider boundaries as applicable.
- Handle error cases deliberately.
- Do not introduce new dependencies unless clearly justified in the slice spec and PR.

Testing requirements:

- Add comprehensive unit tests.
- Cover positive paths, negative paths, edge cases, and failure behavior.
- Use meaningful assertions.
- Update existing tests where behavior changes.
- Do not weaken, skip, or delete tests to make validation pass.

After the first implementation pass, perform a gap review:

- Compare the MVP slice requirements against the implementation.
- Compare the committed slice-specific spec against the implementation.
- Confirm tests cover the implemented behavior.
- Document any gaps found.
- Fix all in-scope gaps before continuing.

## UI And Playwright Testing

When a slice introduces or changes user-visible browser behavior, Playwright must be used for UI validation.

Applicable UI work includes:

- New pages, views, routes, or workflows.
- Changes to existing UI behavior.
- Form validation or submission flows.
- Navigation behavior.
- Authenticated or permission-dependent user flows.
- Error, empty, loading, or success states visible in the browser.
- Overlay rendering behavior.
- Any feature where correctness depends on rendered DOM behavior rather than isolated logic.

For applicable slices, the implementation sub-agent must:

1. Add or update Playwright tests.
2. Cover the primary happy path.
3. Cover meaningful negative or edge cases.
4. Assert visible user-facing outcomes, not only implementation details.
5. Keep Playwright tests focused and stable.
6. Prefer accessible selectors and user-visible text where practical.
7. Run the Playwright test suite during validation.

Unit tests are still required for business logic, utilities, state transitions, and other behavior that can be tested below the browser layer. Playwright complements unit tests; it does not replace them.

If Playwright is not yet configured when it first becomes applicable, the slice must either:

1. Add a minimal project-appropriate Playwright setup as part of that slice, or
2. Stop for human input if adding Playwright would be too large or ambiguous for the slice scope.

## Validation

Before opening a PR:

1. Fetch, rebase, merge, or otherwise ensure the branch is current with `origin/main`.
2. Run the project's validation commands based on existing package scripts.
3. Run the relevant equivalents of:
   - Type checking.
   - Linting.
   - Unit tests.
   - Playwright tests when UI behavior is affected.
   - Build, if applicable.
4. If validation fails, fix the issue before committing.
5. If a failure appears unrelated or blocked by environment constraints, document it clearly and stop for human input.

The PR description must list every validation command that was run and the result.

## Pull Request

When implementation is complete:

1. Ensure the slice-specific spec is committed on the branch.
2. Commit the implementation and tests.
3. Push the branch.
4. Open a PR against `main`.
5. Include the slice-specific spec in the PR diff.

The PR description must include:

- Slice number and summary.
- Link or reference to the committed slice-specific spec.
- Link or reference to MVP requirements.
- Summary of implementation.
- Summary of tests added or changed.
- Playwright coverage added or updated, if UI behavior changed.
- Gap review result.
- Validation commands run and results.
- Any known limitations or follow-up work.

The implementation sub-agent must not merge its own PR.

## Independent Review Sub-Agent

After the PR is opened, start a new independent review sub-agent.

The review sub-agent must:

1. Fetch the latest PR branch and `origin/main`.
2. Review the PR diff.
3. Confirm the slice-specific spec is committed in the PR.
4. Compare the PR against:
   - MVP slice requirements.
   - The committed slice-specific implementation spec.
   - Unit test expectations.
   - Playwright expectations when UI behavior is affected.
5. Look for:
   - Requirement gaps.
   - Spec gaps.
   - Incorrect behavior.
   - Missing edge cases.
   - Weak or missing tests.
   - Missing Playwright coverage for browser-visible behavior.
   - TypeScript issues.
   - Security issues.
   - Code smells.
   - Overengineering.
   - Unrelated changes.
6. Run relevant validation if needed.

If the review finds actionable issues:

1. Implement fixes to the same quality standard.
2. Add or update tests.
3. Add or update Playwright tests if UI behavior is affected.
4. Update the committed slice spec if the spec was incomplete, inaccurate, or missing necessary detail.
5. Rerun validation.
6. Commit and push fixes.
7. Comment on the PR summarizing:
   - Review findings.
   - Fixes made.
   - Spec updates, if any.
   - Tests and validation rerun.
8. Return status: `CHANGES`.

If the review finds no actionable issues:

1. Confirm required checks pass.
2. Confirm the branch is mergeable.
3. Squash merge the PR into `main`.
4. Verify `origin/main` contains the merged implementation, tests, and slice spec.
5. Return status: `MERGED`.

## Review Loop

If the review sub-agent returns `CHANGES`, start a new independent review sub-agent for the same PR and repeat the review process.

Continue until the review sub-agent returns `MERGED`.

Only after `MERGED` may the orchestrator move to the next unimplemented MVP slice.

## Merge Convention

Use squash merge as the required merge strategy for MVP slice PRs.

The review sub-agent may merge the PR only when:

1. The PR includes the committed slice-specific spec.
2. The implementation satisfies the MVP slice requirements.
3. The implementation satisfies the slice-specific spec.
4. Required validation has passed.
5. Any actionable review findings have been fixed.
6. The branch is mergeable into `main`.

When merging:

1. Use squash merge.
2. Use a clear squash commit message:

   ```text
   Implement MVP slice XX: <short title>
   ```

3. Include a concise squash commit body summarizing:
   - Main implementation changes.
   - Tests added or updated.
   - Playwright coverage added or updated, if applicable.
   - The committed slice spec.
   - Validation performed.
4. After merge, verify that `origin/main` contains:
   - The implementation.
   - The tests.
   - The Playwright tests, if applicable.
   - The slice-specific spec.

Only then return status: `MERGED`.

## Stop Conditions

Stop and ask for human input if any of the following occurs:

- The MVP documentation is ambiguous or contradictory.
- The target slice appears already implemented but documentation does not reflect that.
- The work requires a product decision not covered by the MVP docs.
- GitHub authentication or permissions fail after following repository instructions.
- Branch protection, CI, or repository settings prevent merge.
- Validation fails for reasons that cannot be resolved within the slice.
- Playwright setup is required but would be too large or ambiguous for the current slice.
- The PR reveals broader architecture issues outside the slice scope.
- A security concern requires a design decision.
- The implementation would require unrelated large refactors.

When stopping, provide:

- Current slice number.
- Current branch and PR, if any.
- What was completed.
- What is blocked.
- Recommended next decision.

## Completion Status Format

At the end of each slice, report one of:

```text
MERGED
```

or:

```text
CHANGES
```

For `MERGED`, include:

- Slice number and title.
- PR number and URL.
- Squash commit SHA on `origin/main`.
- Validation summary.
- Confirmation that the committed slice spec is present on `origin/main`.

For `CHANGES`, include:

- Slice number and title.
- PR number and URL.
- Review findings.
- Fix commits pushed.
- Validation summary.
- What the next review sub-agent should focus on.
