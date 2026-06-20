import { AxeBuilder } from "@axe-core/playwright";
import { getStoryContext, type TestRunnerConfig } from "@storybook/test-runner";

interface StoryA11yParameters {
  readonly context?: string | undefined;
  readonly disable?: boolean | undefined;
}

interface AxeViolation {
  readonly help: string;
  readonly id: string;
  readonly impact: string | null;
  readonly nodes: readonly {
    readonly target: readonly string[];
  }[];
}

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const a11yParameters = storyContext.parameters.a11y as StoryA11yParameters | undefined;

    if (a11yParameters?.disable === true) {
      return;
    }

    const includeSelector = a11yParameters?.context ?? "#storybook-root";
    const results = await new AxeBuilder({ page }).include(includeSelector).disableRules(["region"]).analyze();

    if (results.violations.length > 0) {
      throw new Error(formatViolations(context.id, results.violations));
    }
  }
};

function formatViolations(storyId: string, violations: readonly AxeViolation[]): string {
  const formattedViolations = violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target)
        .slice(0, 3)
        .join(", ");
      return `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}${targets.length > 0 ? ` [${targets}]` : ""}`;
    })
    .join("\n");

  return `Accessibility violations in ${storyId}:\n${formattedViolations}`;
}

export default config;
