import type { AlertEditorDocument, AlertSetActivationImpact, AlertSetDetail, AlertSetOverview, StreamEventType } from "@stream-jams/core";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagementApi } from "../management-api.js";
import { AlertSetsPage } from "./AlertSetsPage.js";

describe("AlertSetsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", window.location.pathname);
  });
  it("loads the active set, masks browser-source keys, and supports starter review and quick enable", async () => {
    const api = alertSetsApi();
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} onEditAlert={vi.fn()} />);

    expect(await screen.findByRole("region", { name: "Default alert set" })).toBeInTheDocument();
    expect(screen.getByText("One live URL per target profile.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand browser sources" }));
    expect(screen.queryByRole("textbox", { name: "Landscape browser source" })).not.toBeInTheDocument();
    const landscapeSource = screen.getByRole("article", { name: "Landscape browser source" });
    expect(within(landscapeSource).getByText("Ready")).toBeInTheDocument();
    expect(within(landscapeSource).getByText("Profile enabled")).toBeInTheDocument();
    expect(within(landscapeSource).getByText("Listening now")).toBeInTheDocument();
    const verticalSource = screen.getByRole("article", { name: "Vertical browser source" });
    expect(within(verticalSource).getByText("Needs setup")).toBeInTheDocument();
    expect(within(verticalSource).getByText("Profile disabled")).toBeInTheDocument();
    expect(within(verticalSource).getByText("Not listening. No connection recorded.")).toBeInTheDocument();
    expect(screen.getByText("4 need review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reveal Landscape URL" }));
    expect(screen.getByRole("textbox", { name: "Landscape browser source" })).toHaveValue(
      "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape?profile=landscape"
    );
    await user.click(screen.getByRole("button", { name: "Enable New follower" }));
    expect(api.setManagedAlertEnabled).toHaveBeenCalledWith("alert-follow", true);
    await user.click(screen.getByRole("button", { name: "Mark starter review done" }));
    expect(api.markStarterAlertSetReviewComplete).toHaveBeenCalledWith("set-default");
  });

  it("shows only retry when the initial alert-set load fails", async () => {
    const reportError = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const listAlertSets = vi.fn()
      .mockRejectedValueOnce(new Error("Local service unavailable"))
      .mockResolvedValue([overview()]);
    const api = alertSetsApi({ listAlertSets });

    render(<AlertSetsPage managementApi={api} onEditAlert={vi.fn()} />);

    expect(await screen.findByText("Alert sets could not be loaded")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry loading alert sets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create set" })).not.toBeInTheDocument();
    expect(screen.queryByText("No alert sets")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading alert sets" }));
    expect(await screen.findByRole("button", { name: "Create set" })).toBeInTheDocument();
    expect(listAlertSets).toHaveBeenCalledTimes(2);
    reportError.mockRestore();
  });

  it("keeps browser sources outside alert-set management and collapses its details by default", async () => {
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi()} onEditAlert={vi.fn()} />);

    const browserSources = await screen.findByRole("region", { name: "Browser sources" });
    expect(browserSources).toHaveClass("alert-sets-page__browser-source-band");
    const alertSets = screen.getByRole("region", { name: "Alert sets" });
    expect(alertSets).not.toContainElement(browserSources);
    expect(within(browserSources).getByText("1 ready")).toBeInTheDocument();
    expect(within(browserSources).getByText("1 needs setup")).toBeInTheDocument();
    expect(within(browserSources).getByRole("button", { name: "Expand browser sources" })).toHaveAttribute("aria-expanded", "false");
    expect(within(browserSources).queryByRole("article", { name: "Landscape browser source" })).not.toBeInTheDocument();

    await user.click(within(browserSources).getByRole("button", { name: "Expand browser sources" }));

    expect(await within(browserSources).findByRole("button", { name: "Collapse browser sources" })).toHaveAttribute("aria-expanded", "true");
    expect(within(browserSources).getByRole("article", { name: "Landscape browser source" })).toBeInTheDocument();
    const selectedSet = screen.getByRole("region", { name: "Default alert set" });
    expect(alertSets).toContainElement(selectedSet);
    expect(within(selectedSet).getByRole("button", { name: "Collapse Default" })).toHaveAttribute("aria-expanded", "true");
    expect(within(selectedSet).getByRole("button", { name: "Rename Default" })).toBeInTheDocument();
    expect(within(selectedSet).getByRole("button", { name: "Duplicate Default" })).toBeInTheDocument();
    expect(within(selectedSet).getByRole("button", { name: "Delete Default" })).toBeDisabled();
    expect(within(selectedSet).getByRole("button", { name: "Edit New follower" })).toBeInTheDocument();
    expect(within(selectedSet).getByText("1 blocker")).toBeInTheDocument();
    expect(within(selectedSet).getByText("4 need review")).toBeInTheDocument();
    expect(screen.queryByText("Active set")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Validation" })).not.toBeInTheDocument();

    await user.click(within(selectedSet).getByRole("button", { name: "Collapse Default" }));

    expect(within(selectedSet).queryByRole("button", { name: "Edit New follower" })).not.toBeInTheDocument();
    expect(within(selectedSet).getByRole("button", { name: "Expand Default" })).toHaveAttribute("aria-expanded", "false");
    expect(within(selectedSet).getByText("1 blocker")).toBeInTheDocument();
    expect(within(selectedSet).getByText("4 need review")).toBeInTheDocument();
  });

  it("expands browser sources when targeted by the route hash", async () => {
    window.history.replaceState(null, "", "#browser-sources");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

    render(<AlertSetsPage managementApi={alertSetsApi()} onEditAlert={vi.fn()} />);

    const browserSources = await screen.findByRole("region", { name: "Browser sources" });
    expect(await within(browserSources).findByRole("button", { name: "Collapse browser sources" })).toHaveAttribute("aria-expanded", "true");
    expect(within(browserSources).getByRole("article", { name: "Landscape browser source" })).toBeInTheDocument();
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("sends a saved alert test from the row after explicit profile selection", async () => {
    const source = detail();
    source.inventory = source.inventory.map((candidate) => candidate.id === "alert-follow"
      ? { ...candidate, targetProfileIds: ["landscape", "vertical"] }
      : candidate);
    const getAlertEditorDocument = vi.fn(async () => editorDocument());
    const sendAlertEditorTest = vi.fn(async (_alertId, request) => ({
      status: "queued" as const,
      targetProfileId: request.targetProfileId,
      referenceId: "ref-inline-test",
      test: true as const
    }));
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi({
      listAlertSets: vi.fn(async () => [source.overview]),
      getAlertSet: vi.fn(async () => source),
      getAlertEditorDocument,
      sendAlertEditorTest
    })} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Test New follower" }));
    await user.click(screen.getByRole("button", { name: "Send New follower test to Vertical" }));

    await waitFor(() => expect(sendAlertEditorTest).toHaveBeenCalledWith("alert-follow", {
      document: editorDocument(),
      targetProfileId: "vertical",
      samplePayload: { userName: "James" },
      includeAudio: true,
      includeTts: true
    }));
    expect(getAlertEditorDocument).toHaveBeenCalledWith("alert-follow");
    expect(screen.getByText("New follower test queued for Vertical. Reference ref-inline-test.")).toBeInTheDocument();
  });

  it("creates an alert in the expanded set and opens it in the focused editor", async () => {
    const created = {
      ...detail().inventory[0]!,
      id: "alert-cheer",
      eventType: "cheer" as const,
      name: "New cheer",
      previewText: "Thanks for the cheer, {actor.displayName}!"
    };
    const createAlert = vi.fn(async () => created);
    const onEditAlert = vi.fn();
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi({ createAlert })} onEditAlert={onEditAlert} />);

    await user.click(await screen.findByRole("button", { name: "Add alert" }));
    const dialog = screen.getByRole("dialog", { name: "Add alert" });
    await user.selectOptions(within(dialog).getByLabelText("Event type"), "cheer");
    expect(within(dialog).getByLabelText("Alert name")).toHaveValue("New cheer");
    await user.click(within(dialog).getByRole("button", { name: "Create alert" }));

    await waitFor(() => expect(createAlert).toHaveBeenCalledWith("set-default", {
      eventType: "cheer",
      name: "New cheer"
    }));
    expect(onEditAlert).toHaveBeenCalledWith(created);
  });

  it("groups the canonical event picker and selects an event from each group", async () => {
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi()} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Add alert" }));
    const dialog = screen.getByRole("dialog", { name: "Add alert" });
    const picker = within(dialog).getByLabelText("Event type");
    const selections: readonly [string, StreamEventType, string][] = [
      ["Core", "cheer", "New cheer"],
      ["Subscriptions", "community_gift", "Community gift received"],
      ["Hype Train", "hype_train_progress", "Hype Train progress"],
      ["Polls", "poll_end", "Poll ended"],
      ["Predictions", "prediction_end", "Prediction ended"],
      ["Stream", "stream_online", "Stream online"]
    ];

    for (const [group, eventType, defaultName] of selections) {
      expect(dialog.querySelector(`optgroup[label="${group}"] option[value="${eventType}"]`)).not.toBeNull();
      await user.selectOptions(picker, eventType);
      expect(within(dialog).getByLabelText("Alert name")).toHaveValue(defaultName);
    }
  });

  it("nests variations under their default and supports create and duplicate commands", async () => {
    const source = detail();
    const defaultAlert = source.inventory[0]!;
    const variation = {
      ...defaultAlert,
      id: "variant-vip",
      parentAlertId: defaultAlert.id,
      kind: "variation" as const,
      name: "VIP follower"
    };
    source.inventory = [defaultAlert, variation, ...source.inventory.slice(1)];
    const createAlertVariation = vi.fn(async (_alertId, input) => ({ ...variation, id: "variant-new", name: input.name }));
    const duplicateManagedAlert = vi.fn(async () => ({ ...variation, id: "variant-copy", name: "VIP follower copy" }));
    const api = alertSetsApi({
      listAlertSets: vi.fn(async () => [source.overview]),
      getAlertSet: vi.fn(async () => source),
      createAlertVariation,
      duplicateManagedAlert
    });
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} onEditAlert={vi.fn()} />);

    const rows = await screen.findAllByRole("row");
    expect(rows.map((row) => row.textContent).join("|")).toMatch(/New follower.*VIP follower.*New raid/u);
    expect(screen.getByRole("row", { name: /VIP follower/u })).toHaveClass("alert-sets-page__variation-row");

    await user.click(screen.getByRole("button", { name: "Add variation to New follower" }));
    const dialog = screen.getByRole("dialog", { name: "Add variation to New follower" });
    await user.clear(within(dialog).getByLabelText("Variation name"));
    await user.type(within(dialog).getByLabelText("Variation name"), "Large follower");
    await user.click(within(dialog).getByRole("button", { name: "Create variation" }));
    await waitFor(() => expect(createAlertVariation).toHaveBeenCalledWith("alert-follow", { name: "Large follower" }));

    await user.click(screen.getByText("More", { selector: "summary[aria-label='More actions for VIP follower']" }));
    await user.click(screen.getByRole("button", { name: "Duplicate VIP follower" }));
    await waitFor(() => expect(duplicateManagedAlert).toHaveBeenCalledWith("variant-vip"));
  });

  it("requires consequence confirmation before resetting or deleting an alert", async () => {
    const resetManagedAlert = vi.fn(async () => detail().inventory[0]!);
    const deleteManagedAlert = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi({ resetManagedAlert, deleteManagedAlert })} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByText("More", { selector: "summary[aria-label='More actions for New follower']" }));
    await user.click(screen.getByRole("button", { name: "Reset New follower" }));
    const resetDialog = screen.getByRole("dialog", { name: "Reset New follower?" });
    expect(resetDialog).toHaveTextContent("return to the event default");
    await user.click(within(resetDialog).getByRole("button", { name: "Reset alert" }));
    await waitFor(() => expect(resetManagedAlert).toHaveBeenCalledWith("alert-follow", true));

    await user.click(screen.getByText("More", { selector: "summary[aria-label='More actions for New follower']" }));
    await user.click(screen.getByRole("button", { name: "Delete New follower" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete New follower?" });
    expect(deleteDialog).toHaveTextContent("all of its variations");
    await user.click(within(deleteDialog).getByRole("button", { name: "Delete alert" }));
    await waitFor(() => expect(deleteManagedAlert).toHaveBeenCalledWith("alert-follow", true));
  });

  it("keeps alert creation open with an actionable error when the command fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const createAlert = vi.fn(async () => Promise.reject(new Error("Local persistence failed")));
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={alertSetsApi({ createAlert })} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Add alert" }));
    const dialog = screen.getByRole("dialog", { name: "Add alert" });
    await user.click(within(dialog).getByRole("button", { name: "Create alert" }));

    const failure = await within(dialog).findByRole("alert");
    expect(failure).toHaveTextContent("The alert was not created");
    expect(failure).toHaveTextContent("Local persistence failed");
    expect(failure).toHaveTextContent("Review the event type and alert name, then try again.");
    expect(dialog).toBeInTheDocument();
  });

  it("shows activation impact and requires explicit warning confirmation", async () => {
    const seasonal = { ...overview(), id: "set-seasonal", name: "Seasonal", active: false, starter: false };
    const warning = issue("asset-warning", "warning", "ASSET_NEEDS_REVIEW", "One alert uses an asset that needs review.");
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
    render(<AlertSetsPage managementApi={api} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Expand Seasonal" }));
    await user.click(screen.getByRole("button", { name: "Make Seasonal active" }));
    const dialog = await screen.findByRole("dialog", { name: "Activate Seasonal?" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("One alert uses an asset that needs review.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate with warnings" }));

    expect(api.activateAlertSet).toHaveBeenCalledWith("set-seasonal", true);
  });

  it("opens the alert set named by route context", async () => {
    const seasonal = { ...overview(), id: "set-seasonal", name: "Seasonal", active: false, starter: false };
    const getAlertSet = vi.fn(async (setId: string) => ({
      ...detail(),
      overview: setId === seasonal.id ? seasonal : overview()
    }));

    render(
      <AlertSetsPage
        initialSetId={seasonal.id}
        managementApi={alertSetsApi({ listAlertSets: vi.fn(async () => [overview(), seasonal]), getAlertSet })}
        onEditAlert={vi.fn()}
      />
    );

    const selectedSet = await screen.findByRole("region", { name: "Seasonal alert set" });
    expect(within(selectedSet).getByRole("button", { name: "Collapse Seasonal" })).toHaveAttribute("aria-expanded", "true");
    expect(getAlertSet).toHaveBeenCalledWith(seasonal.id);
  });

  it("requires typed confirmation before regenerating a connected browser source", async () => {
    const api = alertSetsApi();
    const user = userEvent.setup();
    render(<AlertSetsPage managementApi={api} onEditAlert={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Expand browser sources" }));
    await user.click(await screen.findByRole("button", { name: "Regenerate Landscape URL" }));
    const dialog = screen.getByRole("dialog", { name: "Regenerate Landscape URL?" });
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

  it("refreshes browser-source listener telemetry every five seconds", async () => {
    vi.useFakeTimers();
    const refreshed = detail();
    refreshed.browserSources = refreshed.browserSources.map((source) => source.targetProfileId === "landscape"
      ? { ...source, connectionState: "disconnected" as const, lastConnectedAt: "2026-07-17T12:00:00.000Z" }
      : source);
    const getAlertSet = vi
      .fn<AlertSetsApi["getAlertSet"]>()
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(refreshed);

    render(<AlertSetsPage managementApi={alertSetsApi({ getAlertSet })} onEditAlert={vi.fn()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => screen.getByRole("button", { name: "Expand browser sources" }).click());
    expect(screen.getByText("Listening now")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(getAlertSet).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Not listening\. Last seen/u)).toBeInTheDocument();
    expect(screen.getByText(/Connection status updated/u)).toBeInTheDocument();
  });

  it("retains listener telemetry and marks it stale when refresh fails", async () => {
    vi.useFakeTimers();
    const reportError = vi.spyOn(console, "error").mockImplementation(() => {});
    const getAlertSet = vi
      .fn<AlertSetsApi["getAlertSet"]>()
      .mockResolvedValueOnce(detail())
      .mockRejectedValue(new Error("Local service request failed"));

    render(<AlertSetsPage managementApi={alertSetsApi({ getAlertSet })} onEditAlert={vi.fn()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => screen.getByRole("button", { name: "Expand browser sources" }).click());
    expect(screen.getByText("Listening now")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(screen.getByText("Listening now")).toBeInTheDocument();
    expect(screen.getByText(/Connection status stale/u)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to refresh browser-source status");
    expect(screen.getByRole("alert")).toHaveTextContent("Live status will retry automatically");

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(getAlertSet).toHaveBeenCalledTimes(3);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

type AlertSetsApi = Pick<
  ManagementApi,
  | "listAlertSets"
  | "getAlertSet"
  | "createAlertSet"
  | "createAlert"
  | "createAlertVariation"
  | "duplicateManagedAlert"
  | "resetManagedAlert"
  | "deleteManagedAlert"
  | "renameAlertSet"
  | "duplicateAlertSet"
  | "getAlertSetActivationImpact"
  | "activateAlertSet"
  | "markStarterAlertSetReviewComplete"
  | "setManagedAlertEnabled"
  | "deleteAlertSet"
  | "getAlertEditorDocument"
  | "sendAlertEditorTest"
  | "createOverlayOutputKey"
  | "regenerateOverlayOutputKey"
>;

function alertSetsApi(overrides: Partial<AlertSetsApi> = {}): AlertSetsApi {
  const source = detail();
  return {
    listAlertSets: vi.fn(async () => [source.overview]),
    getAlertSet: vi.fn(async () => source),
    createAlertSet: vi.fn(async ({ name }) => ({ ...source.overview, id: "set-new", name, active: false, starter: false })),
    createAlert: vi.fn(async (_setId, input) => ({ ...source.inventory[0]!, id: "alert-new", ...input })),
    createAlertVariation: vi.fn(async (alertId, input) => ({ ...source.inventory[0]!, id: "variant-new", parentAlertId: alertId, kind: "variation" as const, name: input.name })),
    duplicateManagedAlert: vi.fn(async () => ({ ...source.inventory[0]!, id: "alert-copy", name: "New follower copy" })),
    resetManagedAlert: vi.fn(async () => source.inventory[0]!),
    deleteManagedAlert: vi.fn(async () => undefined),
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
    getAlertEditorDocument: vi.fn(async () => editorDocument()),
    sendAlertEditorTest: vi.fn(async (_alertId, request) => ({ status: "queued" as const, targetProfileId: request.targetProfileId, referenceId: "ref-inline-test", test: true as const })),
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

function alert(id: string, name: string, eventType: StreamEventType) {
  return {
    id,
    setId: "set-default",
    providerKind: "twitch" as const,
    eventType,
    parentAlertId: null,
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

function output(targetProfileId: "landscape" | "vertical", purpose: "live") {
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

function editorDocument(): AlertEditorDocument {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    layers: [{
      id: "layer-message",
      name: "Message",
      type: "text",
      visible: true,
      order: 0,
      template: "Thanks, {userName}!",
      animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
    }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "layer-message", x: 100, y: 100, width: 600, height: 180, zIndex: 0 }] },
      { id: "vertical", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "layer-message", x: 100, y: 100, width: 600, height: 180, zIndex: 0 }] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: { userName: "James" } }]
  };
}
