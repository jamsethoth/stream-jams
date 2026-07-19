import type { HomeSetupSummary } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
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
        activeAlertSet: null
      })
    })
  }
};

export const Configured: Story = {
  args: {
    managementApi: createStoryManagementApi({ getHomeSetupSummary: async () => configuredSummary })
  }
};
