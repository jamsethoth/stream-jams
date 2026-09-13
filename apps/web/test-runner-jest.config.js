import { getJestConfig } from "@storybook/test-runner";

const config = getJestConfig();
export default {
  ...config,
  modulePathIgnorePatterns: [
    ...(config.modulePathIgnorePatterns ?? []),
    String.raw`[/\\]apps[/\\]desktop[/\\](?:\.stage|out)[/\\]`,
    String.raw`[/\\](?:\.superpowers|test-results|playwright-report|dist-desktop-overlay)[/\\]`
  ]
};
