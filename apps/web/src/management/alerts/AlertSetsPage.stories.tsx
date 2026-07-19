import type { AlertCreateInput, AlertSetDetail, AlertSetOverview, AlertValidationIssue, StreamEventType } from "@stream-jams/core";
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
  args: { managementApi: api([activeSet], detail(activeSet)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const browserSources = await canvas.findByRole("region", { name: "Browser sources" });
    await expect(browserSources).toHaveClass("alert-sets-page__browser-source-band");
    await expect(within(browserSources).getByRole("button", { name: "Expand browser sources" })).toHaveAttribute("aria-expanded", "false");
    const alertSets = canvas.getByRole("region", { name: "Alert sets" });
    const selectedSet = canvas.getByRole("region", { name: "Default alert set" });
    await expect(alertSets).toContainElement(selectedSet);
    await expect(alertSets).not.toContainElement(browserSources);
    await expect(within(selectedSet).getByRole("button", { name: "Collapse Default" })).toHaveAttribute("aria-expanded", "true");
    await within(selectedSet).findByRole("button", { name: "Test New follower" });
  }
};

export const BrowserSourceSetup: Story = {
  args: { managementApi: api([activeSet], detail(activeSet)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
    const source = canvas.getByRole("article", { name: "Landscape browser source" });
    await expect(within(source).getByText("1920 x 1080")).toBeVisible();
    await expect(within(source).getByText(/Add a Browser source in OBS at 1920 x 1080/u)).toBeVisible();
    await userEvent.click(within(source).getByRole("button", { name: "Reveal Landscape URL" }));
    await expect(within(source).getByRole("button", { name: "Hide Landscape URL" })).toBeVisible();
  }
};

export const NarrowRtlExpandedCopy: Story = {
  args: {
    managementApi: (() => {
      const longSet = { ...activeSet, name: "Everyday celebrations and community milestones" };
      const longDetail = detail(longSet);
      return api([longSet], {
        ...longDetail,
        inventory: longDetail.inventory.map((item) => ({ ...item, name: "A very long localized follower celebration title" }))
      });
    })()
  },
  globals: { locale: "ar" },
  parameters: {
    viewport: {
      defaultViewport: "narrowPhone",
      options: {
        narrowPhone: { name: "Narrow phone 390 x 844", styles: { width: "390px", height: "844px" } }
      }
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(await canvas.findByRole("button", { name: /Edit A very long localized/u })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Test A very long localized/u })).toBeVisible();
  }
};

export const InitialLoadFailure: Story = {
  args: {
    managementApi: {
      ...api([activeSet], detail(activeSet)),
      listAlertSets: async () => { throw new Error("The local service is unavailable."); }
    }
  }
};

export const InactiveSelectedSet: Story = {
  args: { managementApi: api([activeSet, inactiveSet], detailById()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Expand Seasonal" }));
    const selectedSet = await canvas.findByRole("region", { name: "Seasonal alert set" });
    await within(selectedSet).findByText("Inactive");
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
    await userEvent.click(await canvas.findByRole("button", { name: "Expand Seasonal" }));
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
    await userEvent.click(await canvas.findByRole("button", { name: "Expand Seasonal" }));
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

const createAlert = fn(async (setId: string, input: AlertCreateInput) => ({
  ...alert("alert-cheer", input.name, input.eventType, setId, false, "needs-review"),
  targetProfileIds: ["landscape" as const, "vertical" as const]
}));

export const CreateAlert: Story = {
  args: {
    managementApi: { ...api([activeSet], detail(activeSet)), createAlert },
    onEditAlert: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add alert" }));
    const dialog = await canvas.findByRole("dialog", { name: "Add alert" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), "cheer");
    await expect(within(dialog).getByLabelText("Alert name")).toHaveValue("New cheer");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create alert" }));
    await waitFor(() => expect(args.onEditAlert).toHaveBeenCalledWith(expect.objectContaining({ id: "alert-cheer" })));
  }
};

export const GroupedEventPicker: Story = {
  args: {
    managementApi: { ...api([activeSet], detail(activeSet)), createAlert },
    onEditAlert: fn()
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add alert" }));
    const dialog = await canvas.findByRole("dialog", { name: "Add alert" });
    for (const group of ["Core", "Subscriptions", "Hype Train", "Polls", "Predictions", "Stream"]) {
      await expect(dialog.querySelector(`optgroup[label="${group}"]`)).not.toBeNull();
    }
    await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), "community_gift");
    await expect(within(dialog).getByText("One alert for each aggregate community gift, not each recipient.")).toBeVisible();
  }
};

export const DefaultWithVariations: Story = {
  args: { managementApi: api([activeSet], detailWithVariation()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const variation = await canvas.findByRole("row", { name: /Large raid/u });
    await expect(variation).toHaveClass("alert-sets-page__variation-row");
    await userEvent.click(canvas.getByText("More", { selector: "summary[aria-label='More actions for New raid']" }));
    await expect(canvas.getByRole("button", { name: "Add variation to New raid" })).toBeVisible();
  }
};

export const DuplicateVariationNeedsReview: Story = {
  args: {
    managementApi: createStoryManagementApi({
      ...api([activeSet], detailWithVariation()),
      duplicateManagedAlert: async () => ({
        ...detailWithVariation().inventory[2]!,
        id: "variant-large-raid-copy",
        name: "Large raid copy",
        enabled: false,
        reviewState: "needs-review"
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("More", { selector: "summary[aria-label='More actions for Large raid']" }));
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate Large raid" }));
    await expect(await canvas.findByText("Large raid copy duplicated disabled and marked Needs review.")).toBeVisible();
  }
};

export const DestructiveVariationConfirmation: Story = {
  args: { managementApi: api([activeSet], detailWithVariation()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("More", { selector: "summary[aria-label='More actions for Large raid']" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete Large raid" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "Delete Large raid?" }));
    await expect(dialog.getByText("This permanently deletes only this variation. Shared assets remain available.")).toBeVisible();
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
      await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
      await userEvent.click(await canvas.findByRole("button", { name: "Copy Landscape URL" }));
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
    await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Regenerate Landscape URL" }));
    const dialog = await canvas.findByRole("dialog", { name: "Regenerate Landscape URL?" });
    await userEvent.type(within(dialog).getByLabelText("Type REGENERATE to continue"), "REGENERATE");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Regenerate URL" })).toBeEnabled());
  }
};

export const StatusRefreshFailure: Story = {
  args: { managementApi: statusRefreshFailureApi() },
  play: async ({ canvasElement }) => {
    const reportError = console.error;
    console.error = fn();
    try {
      const canvas = within(canvasElement);
      await userEvent.click(await canvas.findByRole("button", { name: "Expand browser sources" }));
      await canvas.findByText(/Connection status stale/u, {}, { timeout: 7_000 });
      await expect(canvas.getByRole("alert")).toHaveTextContent("Unable to refresh browser-source status");
      await expect(canvas.getByText("Listening now")).toBeVisible();
    } finally {
      console.error = reportError;
    }
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

function statusRefreshFailureApi() {
  const source = detail(activeSet);
  const managementApi = api([activeSet], source);
  let reads = 0;
  return {
    ...managementApi,
    getAlertSet: async () => {
      reads += 1;
      if (reads > 1) throw new Error("Local service request failed");
      return source;
    }
  };
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
        id: "module:alerts:vertical:live",
        targetProfileId: "vertical",
        purpose: "live",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      }
    ]
  };
}

function detailWithVariation(): AlertSetDetail {
  const source = detail(activeSet);
  const raid = source.inventory[1]!;
  return {
    ...source,
    inventory: [
      source.inventory[0]!,
      raid,
      { ...raid, id: "variant-large-raid", parentAlertId: raid.id, name: "Large raid", kind: "variation", enabled: false, reviewState: "needs-review" },
      ...source.inventory.slice(2)
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
  eventType: StreamEventType,
  setId: string,
  enabled: boolean,
  reviewState: "ready" | "needs-review"
) {
  return {
    id,
    setId,
    providerKind: "twitch" as const,
    eventType,
    parentAlertId: null,
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
