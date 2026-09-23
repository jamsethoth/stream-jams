import type { ActionableManagementError, HomeSetupSummary } from "@stream-jams/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePanel } from "./HomePanel.js";

const providerError: ActionableManagementError = {
  summary: "Twitch intake stopped",
  cause: "EventSub disconnected.",
  nextStep: "Reconnect Twitch, then test the event source.",
  severity: "error",
  occurredAt: "2026-07-15T12:00:00.000Z",
  referenceId: "ref-home-17",
  correction: { label: "Open Twitch", route: "/manage/event-sources?provider=twitch-main" }
};

const configuredSummary: HomeSetupSummary = {
  readiness: [
    {
      id: "event-source",
      label: "Event source",
      state: "blocked",
      actionLabel: "Resolve event source",
      actionRoute: "/manage/event-sources?provider=twitch-main"
    },
    {
      id: "tts-provider",
      label: "TTS provider",
      state: "complete",
      actionLabel: "Review TTS provider",
      actionRoute: "/manage/tts-providers"
    }
  ],
  activeAlertSet: {
    id: "default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 1 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [
      {
        id: "warning-1",
        severity: "warning",
        code: "TEXT_OVERFLOW",
        message: "Text may overflow.",
        nextStep: "Review the landscape layout.",
        targetProfileId: "landscape",
        providerKind: "twitch",
        eventType: "follow",
        alertId: "follow-default",
        referenceId: null
      }
    ],
    outputs: []
  },
  alertConfiguration: {
    state: "attention",
    enabledAlertCount: 1,
    items: [{
      alertId: "follow-default",
      name: "New follower",
      eventType: "follow",
      state: "review-needed",
      message: "Finish reviewing the Landscape profile.",
      actionRoute: "/manage/modules/alerts/editor/follow-default?set=default&event=follow&profile=landscape"
    }]
  },
  actionableProblems: [providerError]
};

describe("HomePanel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes transitional event-source readiness until startup becomes healthy", async () => {
    vi.useFakeTimers();
    const starting = {
      ...configuredSummary,
      readiness: configuredSummary.readiness.map((item) => item.id === "event-source"
        ? { ...item, state: "action-required" as const, actionLabel: "Starting event source" }
        : item),
      actionableProblems: []
    };
    const healthy = {
      ...starting,
      readiness: starting.readiness.map((item) => item.id === "event-source"
        ? { ...item, state: "complete" as const, actionLabel: "Review event source" }
        : item)
    };
    const getHomeSetupSummary = vi.fn()
      .mockResolvedValueOnce(starting)
      .mockRejectedValueOnce(new Error("temporary startup race"))
      .mockResolvedValue(healthy);

    render(<HomePanel managementApi={{ getHomeSetupSummary }} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("link", { name: "Starting event source" })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByRole("link", { name: "Starting event source" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByRole("link", { name: "Review event source" })).toBeInTheDocument();
    expect(getHomeSetupSummary).toHaveBeenCalledTimes(3);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getHomeSetupSummary).toHaveBeenCalledTimes(3);
  });

  it("shows derived readiness actions, active set status, and actionable problems", async () => {
    render(<HomePanel managementApi={{ getHomeSetupSummary: vi.fn(async () => configuredSummary) }} />);

    expect(await screen.findByRole("heading", { name: "Setup readiness" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolve event source" })).toHaveAttribute(
      "href",
      "/manage/event-sources?provider=twitch-main"
    );
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("1 enabled alert")).toBeInTheDocument();
    expect(screen.getByText("1 warning")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Reconnect Twitch, then test the event source.");
    expect(screen.getByText("ref-home-17")).toBeInTheDocument();
    const problems = screen.getByRole("heading", { name: "Needs attention" });
    const setup = screen.getByRole("heading", { name: "Setup readiness" });
    expect(problems.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Next action")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alert configuration" })).toBeInTheDocument();
    expect(screen.getByText("New follower")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review alert" })).toHaveAttribute("href", configuredSummary.alertConfiguration.items[0]!.actionRoute);
    expect(screen.getByText(/Connection and delivery still require/)).toBeInTheDocument();
    const completed = screen.getByText("Completed setup (1)");
    expect(completed.closest("details")).not.toHaveAttribute("open");
  });

  it("keeps all-complete readiness concise with completed steps disclosed", async () => {
    const complete = {
      ...configuredSummary,
      readiness: configuredSummary.readiness.map((item) => ({ ...item, state: "complete" as const })),
      actionableProblems: []
    };
    render(<HomePanel managementApi={{ getHomeSetupSummary: vi.fn(async () => complete) }} />);

    expect(await screen.findByText("Setup is complete.")).toBeInTheDocument();
    expect(screen.getByText("Completed setup (2)").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Active alert set" })).toBeInTheDocument();
  });

  it("omits zero blocker and warning facts for a clean active set", async () => {
    const cleanSummary: HomeSetupSummary = {
      ...configuredSummary,
      activeAlertSet: {
        ...configuredSummary.activeAlertSet!,
        targetProfiles: configuredSummary.activeAlertSet!.targetProfiles.map((profile) => ({ ...profile, warningCount: 0 })),
        validationIssues: []
      },
      actionableProblems: []
    };

    render(<HomePanel managementApi={{ getHomeSetupSummary: vi.fn(async () => cleanSummary) }} />);

    expect(await screen.findByText("Default")).toBeInTheDocument();
    expect(screen.queryByText("Blockers")).not.toBeInTheDocument();
    expect(screen.queryByText("Warnings")).not.toBeInTheDocument();
  });

  it("turns load failure into a visible next step", async () => {
    render(
      <HomePanel
        managementApi={{
          getHomeSetupSummary: vi.fn(async () => {
            throw new Error("Local service did not respond.");
          })
        }}
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load setup readiness");
    expect(alert).toHaveTextContent("Local service did not respond.");
    expect(alert).toHaveTextContent("Refresh this page after confirming the local Stream Jams service is running.");
  });
});
