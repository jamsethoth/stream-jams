import type { ActionableManagementError, HomeSetupSummary } from "@stream-jams/core";
import { cleanup, render, screen } from "@testing-library/react";
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
  actionableProblems: [providerError]
};

describe("HomePanel", () => {
  afterEach(cleanup);

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
