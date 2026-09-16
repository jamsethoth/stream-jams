import type { HomeSetupSummary } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { HomePanel } from "./HomePanel.js";

const configuredSummary: HomeSetupSummary = {
  readiness: [
    { id: "event-source", label: "Event source", state: "complete", actionLabel: "Review event source", actionRoute: "/manage/event-sources" },
    { id: "tts-provider", label: "TTS provider", state: "complete", actionLabel: "Review TTS provider", actionRoute: "/manage/tts-providers" },
    { id: "starter-alert-set", label: "Starter alert set", state: "complete", actionLabel: "Review active set", actionRoute: "/manage/modules/alerts" },
    { id: "browser-output", label: "Browser-source output", state: "complete", actionLabel: "Review output", actionRoute: "/manage/modules/alerts#browser-sources" }
  ],
  activeAlertSet: {
    id: "set-default",
    name: "Default alerts",
    active: true,
    starter: true,
    starterReviewState: "complete",
    enabledAlertCount: 6,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 1 }
    ],
    validationIssues: [],
    outputs: []
  },
  alertConfiguration: { state: "configured", enabledAlertCount: 6, items: [] },
  actionableProblems: []
};

const meta = {
  title: "Management/Home",
  component: HomePanel
} satisfies Meta<typeof HomePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstRun: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getHomeSetupSummary: async () => ({
        readiness: configuredSummary.readiness.map((item) => ({ ...item, state: "action-required" as const })),
        activeAlertSet: null,
        alertConfiguration: { state: "no-active-set" as const, enabledAlertCount: 0, items: [] },
        actionableProblems: []
      })
    })
  }
};

export const PartiallyConfigured: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getHomeSetupSummary: async () => ({
        ...configuredSummary,
        readiness: configuredSummary.readiness.map((item, index) => ({
          ...item,
          state: index < 2 ? "complete" as const : "action-required" as const
        })),
        activeAlertSet: null,
        alertConfiguration: { state: "no-active-set" as const, enabledAlertCount: 0, items: [] }
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Next action")).toBeVisible();
    await expect(canvas.getByText("Completed setup (2)").closest("details")).not.toHaveAttribute("open");
  }
};

export const Configured: Story = {
  args: {
    managementApi: createStoryManagementApi({ getHomeSetupSummary: async () => configuredSummary })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Setup is complete.")).toBeVisible();
    await expect(canvas.getByText("Completed setup (4)").closest("details")).not.toHaveAttribute("open");
  }
};

export const NeedsAttentionFirst: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getHomeSetupSummary: async () => ({
        ...configuredSummary,
        readiness: [{ ...configuredSummary.readiness[0]!, state: "blocked" }],
        alertConfiguration: {
          state: "attention",
          enabledAlertCount: 6,
          items: [{
            alertId: "follow-default",
            name: "New follower",
            eventType: "follow",
            state: "review-needed",
            message: "Finish reviewing the Landscape profile.",
            actionRoute: "/manage/modules/alerts/editor/follow-default?set=set-default&event=follow&profile=landscape"
          }]
        },
        actionableProblems: [{
          summary: "Event source needs attention",
          cause: "Event intake is unavailable.",
          nextStep: "Review the event source connection.",
          severity: "error",
          occurredAt: "2026-09-15T12:00:00.000Z",
          referenceId: "ref-home-story",
          correction: { label: "Open event sources", route: "/manage/event-sources" }
        }]
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const problems = await canvas.findByRole("heading", { name: "Needs attention" });
    const setup = canvas.getByRole("heading", { name: "Setup readiness" });
    await expect(Boolean(problems.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    await expect(canvas.getByText("New follower")).toBeVisible();
  }
};
