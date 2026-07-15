import type { AlertSetActivationImpact, AlertSetDetail, AlertSetOverview } from "@stream-jams/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagementApi } from "../management-api.js";
import { AlertSetsPage } from "./AlertSetsPage.js";

describe("AlertSetsPage", () => {
  afterEach(cleanup);
  it("loads the active set, masks browser-source keys, and supports starter review and quick enable", async () => {
    const api = alertSetsApi();
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} />);

    expect(await screen.findByRole("heading", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByText("Active set")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Landscape live browser source" })).toHaveValue(
      "http://127.0.0.1:39187/overlay/modules/alerts/live/********?profile=landscape"
    );
    expect(screen.getByText("4 alerts need review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reveal Landscape live URL" }));
    expect(screen.getByRole("textbox", { name: "Landscape live browser source" })).toHaveValue(
      "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape?profile=landscape"
    );
    await user.click(screen.getByRole("button", { name: "Enable New follower" }));
    expect(api.setManagedAlertEnabled).toHaveBeenCalledWith("alert-follow", true);
    await user.click(screen.getByRole("button", { name: "Mark starter review done" }));
    expect(api.markStarterAlertSetReviewComplete).toHaveBeenCalledWith("set-default");
  });

  it("shows activation impact and requires explicit warning confirmation", async () => {
    const seasonal = { ...overview(), id: "set-seasonal", name: "Seasonal", active: false, starter: false };
    const warning = issue("provider-warning", "warning", "PROVIDER_KIND_MISMATCH", "Alerts use Twitch while Streamer.bot is active.");
    const api = alertSetsApi({
      listAlertSets: vi.fn(async () => [overview(), seasonal]),
      getAlertSet: vi.fn(async (setId) => ({
        ...detail(),
        overview: setId === seasonal.id ? { ...seasonal, validationIssues: [warning] } : overview()
      })),
      getAlertSetActivationImpact: vi.fn(async () => ({
        ...impact(),
        currentActiveSetId: "set-default",
        replacingActiveSetName: "Default",
        warnings: [warning]
      }))
    });
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} />);

    await user.click(await screen.findByRole("button", { name: "View Seasonal" }));
    await user.click(screen.getByRole("button", { name: "Make Seasonal active" }));
    const dialog = await screen.findByRole("dialog", { name: "Activate Seasonal?" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Alerts use Twitch while Streamer.bot is active.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate with warnings" }));

    expect(api.activateAlertSet).toHaveBeenCalledWith("set-seasonal", true);
  });

  it("requires typed confirmation before regenerating a connected browser source", async () => {
    const api = alertSetsApi();
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} />);

    await user.click(await screen.findByRole("button", { name: "Regenerate Landscape live URL" }));
    const dialog = screen.getByRole("dialog", { name: "Regenerate Landscape live URL?" });
    const confirmButton = screen.getByRole("button", { name: "Regenerate URL" });
    expect(dialog).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type REGENERATE to continue"), "REGENERATE");
    await user.click(confirmButton);

    await waitFor(() => expect(api.regenerateOverlayOutputKey).toHaveBeenCalledWith({
      overlayId: "default",
      scope: "module",
      moduleId: "alerts",
      purpose: "live",
      targetProfileId: "landscape"
    }));
  });
});

type AlertSetsApi = Pick<
  ManagementApi,
  | "listAlertSets"
  | "getAlertSet"
  | "createAlertSet"
  | "renameAlertSet"
  | "duplicateAlertSet"
  | "getAlertSetActivationImpact"
  | "activateAlertSet"
  | "markStarterAlertSetReviewComplete"
  | "setManagedAlertEnabled"
  | "deleteAlertSet"
  | "createOverlayOutputKey"
  | "regenerateOverlayOutputKey"
>;

function alertSetsApi(overrides: Partial<AlertSetsApi> = {}): AlertSetsApi {
  const source = detail();
  return {
    listAlertSets: vi.fn(async () => [source.overview]),
    getAlertSet: vi.fn(async () => source),
    createAlertSet: vi.fn(async ({ name }) => ({ ...source.overview, id: "set-new", name, active: false, starter: false })),
    renameAlertSet: vi.fn(async (_setId, { name }) => ({ ...source.overview, name })),
    duplicateAlertSet: vi.fn(async (_setId, { name }) => ({ ...source.overview, id: "set-copy", name, active: false, starter: false })),
    getAlertSetActivationImpact: vi.fn(async () => impact()),
    activateAlertSet: vi.fn(async () => ({ activeSet: source.overview, replacedSetId: null, impact: impact() })),
    markStarterAlertSetReviewComplete: vi.fn(async () => ({ ...source.overview, starterReviewState: "complete" as const })),
    setManagedAlertEnabled: vi.fn(async () => ({
      ...source,
      overview: { ...source.overview, enabledAlertCount: 1 },
      inventory: source.inventory.map((alert) => alert.id === "alert-follow" ? { ...alert, enabled: true } : alert)
    })),
    deleteAlertSet: vi.fn(async () => undefined),
    createOverlayOutputKey: vi.fn(async () => ({
      keyId: "key-created",
      url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_created?profile=landscape",
      output: output("landscape", "live")
    })),
    regenerateOverlayOutputKey: vi.fn(async () => ({
      keyId: "key-regenerated",
      url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_regenerated?profile=landscape",
      output: output("landscape", "live")
    })),
    ...overrides
  };
}

function detail(): AlertSetDetail {
  return {
    overview: overview(),
    inventory: [
      alert("alert-follow", "New follower", "follow"),
      alert("alert-raid", "New raid", "raid"),
      alert("alert-sub", "New subscriber", "subscription"),
      alert("alert-reward", "Custom reward", "channel_point_redemption")
    ],
    browserSources: [
      {
        id: "module:alerts:landscape:live",
        targetProfileId: "landscape",
        purpose: "live",
        connectionState: "connected",
        lastConnectedAt: "2026-07-15T05:00:00.000Z",
        keyId: "key-landscape",
        url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape?profile=landscape",
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

function overview(): AlertSetOverview {
  return {
    id: "set-default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState: "pending",
    enabledAlertCount: 0,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [issue("no-alerts", "blocker", "NO_ENABLED_ALERTS", "Enable at least one alert before activation.")],
    outputs: []
  };
}

function alert(id: string, name: string, eventType: "follow" | "raid" | "subscription" | "channel_point_redemption") {
  return {
    id,
    setId: "set-default",
    providerKind: "twitch" as const,
    eventType,
    name,
    kind: "default" as const,
    enabled: false,
    reviewState: "needs-review" as const,
    targetProfileIds: ["landscape" as const],
    previewText: `${name} preview`
  };
}

function issue(id: string, severity: "blocker" | "warning", code: string, message: string) {
  return {
    id,
    severity,
    code,
    message,
    nextStep: "Review the affected alert.",
    targetProfileId: null,
    providerKind: null,
    eventType: null,
    alertId: null,
    referenceId: null
  } as const;
}

function impact(): AlertSetActivationImpact {
  return {
    currentActiveSetId: "set-default",
    replacingActiveSetName: null,
    enabledAlertCount: 0,
    affectedTargetProfileIds: ["landscape"],
    affectedEventTypes: [],
    blockers: [],
    warnings: []
  };
}

function output(targetProfileId: "landscape" | "vertical", purpose: "live" | "test") {
  return {
    id: `module:alerts:${targetProfileId}:${purpose}`,
    label: `Alerts ${targetProfileId} ${purpose}`,
    purpose,
    scope: "module" as const,
    moduleId: "alerts",
    targetProfileId,
    overlayId: "default",
    enabled: true,
    keyId: "key-regenerated",
    url: `http://127.0.0.1:39187/overlay/modules/alerts/${purpose}/ovl_regenerated?profile=${targetProfileId}`,
    copyableUrlStatus: "available" as const
  };
}
