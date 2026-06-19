# Visual Regression Options

Default now: local Storybook build/test-runner plus local Playwright screenshots when browser-visible behavior changes. Hosted visual review remains a later tool decision.

## Options

| Option | Pros | Cons | Best fit |
| --- | --- | --- | --- |
| Local Playwright screenshots against the app | Uses the existing Playwright stack, exercises real routes, catches layout regressions in management and overlay flows. | Baselines can be OS/browser sensitive, requires checked-in snapshots or artifact review policy, slower than isolated stories. | Critical workflows and overlay route behavior. |
| Local Playwright screenshots against Storybook | Isolates components, easy to cover empty/loading/error states, pairs well with fixed Storybook fixtures. | Needs Storybook running during tests, still needs baseline policy, less coverage of app routing/auth integration. | Component-level visual checks and agent-friendly state review. |
| Chromatic | Storybook-native hosted review, PR visual diffs, interaction and accessibility test support. | Hosted service, account/project setup, cost and retention decisions, CI secret management. | Team review of visual changes after Storybook baseline stabilizes. |
| Argos-style hosted visual diffs | Open-source oriented hosted visual diff workflow, PR review of screenshot changes, can pair with Playwright or Storybook captures. | Requires service setup and CI token, less Storybook-native than Chromatic, must decide screenshot capture conventions. | Lightweight hosted PR visual approval. |
| Percy-style hosted visual diffs | Mature hosted visual review, cross-browser/device options, PR status integration. | Hosted service and pricing, CI secret management, extra SDK/config surface. | Cross-browser or device-oriented visual review. |

## Recommendation

1. Gate Storybook build and Storybook test-runner in CI.
2. Use local Playwright screenshots for high-value overlay and management workflows when visual risk is high.
3. Keep hosted visual tooling out of the repo until the story inventory is stable.
4. Re-evaluate Chromatic, Argos, and Percy after the project has enough stories and PR volume to justify hosted visual approval.

## Baseline Rules

- Use deterministic fixtures and tiny checked-in assets.
- Do not use real overlay keys, OAuth tokens, local file paths, or personal channel data in screenshots.
- Prefer component stories for state explosion and Playwright app tests for route/auth/runtime behavior.
- Review screenshot diffs manually before accepting baseline changes.

## Sources

- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Storybook React/Vite docs: https://storybook.js.org/docs/get-started/frameworks/react-vite
- Storybook test-runner: https://storybook.js.org/docs/writing-tests/integrations/test-runner
- Chromatic docs: https://www.chromatic.com/docs/
- Percy docs: https://www.browserstack.com/docs/percy
