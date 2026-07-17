import type { AlertSetDetail, AlertSetOverview, AlertValidationIssue } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { AlertSetsPage } from "./AlertSetsPage.js";

const activeSet = overview("set-default", "Default", true);
const inactiveSet = overview("set-seasonal", "Seasonal", false);

const meta = {
  title: "Management/Alerts/Alert sets",
  component: AlertSetsPage,
  args: { onEditAlert: fn() },
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof AlertSetsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSet: Story = {
  args: { managementApi: api([activeSet], detail(activeSet)) }
};

export const InactiveSelectedSet: Story = {
  args: { managementApi: api([activeSet, inactiveSet], detailById()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "View Seasonal" }));
    await canvas.findByText("Saved, not active");
  }
};

export const ActivationBlocked: Story = {
  args: {
    managementApi: api([activeSet, inactiveSet], detailById(), {
      blockers: [issue("missing-alert", "blocker", "Enable at least one alert before activation.")]
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "View Seasonal" }));
    await userEvent.click(canvas.getByRole("button", { name: "Make Seasonal active" }));
    const dialog = await canvas.findByRole("dialog", { name: "Activate Seasonal?" });
    await expect(within(dialog).getByRole("button", { name: "Activate" })).toBeDisabled();
  }
};

export const ActivationWarning: Story = {
  args: {
    managementApi: api([activeSet, inactiveSet], detailById(), {
      warnings: [issue("asset-review", "warning", "One alert uses an asset that needs review.")]
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "View Seasonal" }));
    await userEvent.click(canvas.getByRole("button", { name: "Make Seasonal active" }));
    await canvas.findByRole("button", { name: "Activate with warnings" });
  }
};

export const StarterNeedsReview: Story = {
  args: { managementApi: api([activeSet], detail(activeSet)) },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Mark starter review done" });
  }
};

export const CopyFailure: Story = {
  args: { managementApi: api([activeSet], detail(activeSet)) },
  play: async ({ canvasElement }) => {
    const reportError = console.error;
    console.error = fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: fn(async () => Promise.reject(new Error("Clipboard permission denied."))) }
    });
    try {
      const canvas = within(canvasElement);
      await userEvent.click(await canvas.findByRole("button", { name: "Copy Landscape live URL" }));
      await canvas.findByText("The browser-source URL was not copied");
    } finally {
      console.error = reportError;
    }
  }
};

export const RegenerationConfirmation: Story = {
  args: { managementApi: api([activeSet], detail(activeSet)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Regenerate Landscape live URL" }));
    const dialog = await canvas.findByRole("dialog", { name: "Regenerate Landscape live URL?" });
    await userEvent.type(within(dialog).getByLabelText("Type REGENERATE to continue"), "REGENERATE");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Regenerate URL" })).toBeEnabled());
  }
};

function api(
  sets: readonly AlertSetOverview[],
  detailSource: AlertSetDetail | ((setId: string) => AlertSetDetail),
  activation: { readonly blockers?: readonly AlertValidationIssue[]; readonly warnings?: readonly AlertValidationIssue[] } = {}
) {
  const getDetail = typeof detailSource === "function" ? detailSource : () => detailSource;
  return createStoryManagementApi({
    listAlertSets: async () => sets,
    getAlertSet: async (setId) => getDetail(setId),
    getAlertSetActivationImpact: async () => ({
      currentActiveSetId: "set-default",
      replacingActiveSetName: "Default",
      enabledAlertCount: 3,
      affectedTargetProfileIds: ["landscape"],
      affectedEventTypes: ["follow", "raid", "subscription"],
      blockers: [...(activation.blockers ?? [])],
      warnings: [...(activation.warnings ?? [])]
    }),
    activateAlertSet: async (setId) => ({
      activeSet: { ...getDetail(setId).overview, active: true },
      replacedSetId: "set-default",
      impact: {
        currentActiveSetId: "set-default",
        replacingActiveSetName: "Default",
        enabledAlertCount: 3,
        affectedTargetProfileIds: ["landscape"],
        affectedEventTypes: ["follow", "raid", "subscription"],
        blockers: [],
        warnings: [...(activation.warnings ?? [])]
      }
    }),
    markStarterAlertSetReviewComplete: async () => ({ ...activeSet, starterReviewState: "complete" }),
    setManagedAlertEnabled: async (alertId, enabled) => {
      const current = getDetail("set-default");
      return { ...current, inventory: current.inventory.map((alert) => alert.id === alertId ? { ...alert, enabled } : alert) };
    }
  });
}

function detailById() {
  return (setId: string) => detail(setId === inactiveSet.id ? inactiveSet : activeSet);
}

function detail(set: AlertSetOverview): AlertSetDetail {
  return {
    overview: set,
    inventory: [
      alert("alert-follow", "New follower", "follow", set.id, true, "ready"),
      alert("alert-raid", "New raid", "raid", set.id, true, "ready"),
      alert("alert-sub", "New subscriber", "subscription", set.id, true, "ready"),
      alert("alert-reward", "Custom reward", "channel_point_redemption", set.id, false, "needs-review")
    ],
    browserSources: [
      {
        id: "module:alerts:landscape:live",
        targetProfileId: "landscape",
        purpose: "live",
        connectionState: "connected",
        lastConnectedAt: "2026-07-15T05:00:00.000Z",
        keyId: "key-live-landscape",
        url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_story_landscape?profile=landscape",
        copyableUrlStatus: "available"
      },
      {
        id: "module:alerts:landscape:test",
        targetProfileId: "landscape",
        purpose: "test",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: "key-test-landscape",
        url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_story_test?profile=landscape",
        copyableUrlStatus: "available"
      },
      {
        id: "module:alerts:vertical:live",
        targetProfileId: "vertical",
        purpose: "live",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      },
      {
        id: "module:alerts:vertical:test",
        targetProfileId: "vertical",
        purpose: "test",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      }
    ]
  };
}

function overview(id: string, name: string, active: boolean): AlertSetOverview {
  return {
    id,
    name,
    active,
    starter: id === "set-default",
    starterReviewState: id === "set-default" ? "pending" : "complete",
    enabledAlertCount: id === "set-default" ? 3 : 0,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
}

function alert(
  id: string,
  name: string,
  eventType: "follow" | "raid" | "subscription" | "channel_point_redemption",
  setId: string,
  enabled: boolean,
  reviewState: "ready" | "needs-review"
) {
  return {
    id,
    setId,
    providerKind: "twitch" as const,
    eventType,
    name,
    kind: "default" as const,
    enabled,
    reviewState,
    targetProfileIds: ["landscape" as const],
    previewText: `${name} sample preview`
  };
}

function issue(id: string, severity: "blocker" | "warning", message: string): AlertValidationIssue {
  return {
    id,
    severity,
    code: id.toUpperCase(),
    message,
    nextStep: "Review the selected alert set before activation.",
    targetProfileId: null,
    providerKind: null,
    eventType: null,
    alertId: null,
    referenceId: null
  };
}
