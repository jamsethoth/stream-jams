import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagnosticsWorkspaceView } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticsDebugExportView, DiagnosticsExportView } from "../management-api.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DiagnosticsPanel", () => {
  it("groups active problems and searches by reference ID without hiding correction context", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsPanel managementApi={managementApi()} />);

    expect(await screen.findByRole("heading", { name: "Error · Providers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Error · Outputs" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Reference ID or message"), "ref-output-1");

    expect(screen.getByRole("button", { name: /Send test blocked/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Event source disconnected/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open browser sources" })).toHaveAttribute(
      "href",
      "/modules/alerts?diagnostic=ref-output-1#browser-sources"
    );
  });

  it("shows an explicit healthy state when there are no problems", async () => {
    render(<DiagnosticsPanel managementApi={managementApi({ ...workspace(), problems: [] })} />);

    expect(await screen.findByText("No active problems")).toBeInTheDocument();
    expect(screen.getByText(/have not reported a failure/)).toBeInTheDocument();
  });

  it("filters normalized events and shows selected event detail with its correction link", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsPanel managementApi={managementApi()} />);
    await screen.findByRole("heading", { name: "Open problems" });

    const problemsTab = screen.getByRole("tab", { name: /Problems/ });
    problemsTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Events/ })).toHaveAttribute("aria-selected", "true");
    await user.selectOptions(screen.getByLabelText("Outcome"), "failed");
    await user.click(screen.getByRole("button", { name: "subscription" }));
    const detail = screen.getByLabelText("Event detail");

    expect(within(detail).getByRole("heading", { name: "subscription" })).toBeInTheDocument();
    expect(within(detail).getByText("Alert rendering failed.")).toBeInTheDocument();
    expect(within(detail).getByText("Live")).toBeInTheDocument();
    expect(within(detail).getByText(new Date("2026-07-15T22:28:07.000Z").toLocaleString())).toBeInTheDocument();
    expect(within(detail).getAllByText(/viewer42/)).toHaveLength(2);
    expect(within(detail).getByRole("link", { name: "Open alert" })).toHaveAttribute(
      "href",
      "/modules/alerts/editor/alert-sub?diagnostic=ref-event-2"
    );
  });

  it("copies only the sanitized raw-log bundle", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<DiagnosticsPanel managementApi={managementApi()} />);
    await screen.findByRole("heading", { name: "Open problems" });

    await user.click(screen.getByRole("tab", { name: /Raw logs/ }));
    await user.click(screen.getByRole("button", { name: /ref-runtime-2/ }));
    await user.click(screen.getByRole("button", { name: "Copy sanitized event" }));

    expect(writeText).toHaveBeenCalledOnce();
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied).toContain("[REDACTED]");
    expect(copied).not.toContain("oauth-secret");
    expect(await screen.findByText("Sanitized event copied")).toBeInTheDocument();
  });

  it("shows human-readable export failure recovery and preserves the backend reference ID", async () => {
    const user = userEvent.setup();
    const api = managementApi();
    api.exportDiagnostics = vi.fn(async () => {
      throw new Error("The diagnostics archive could not be written. (DIAGNOSTICS_EXPORT_FAILED, ref-export-1)");
    });
    render(<DiagnosticsPanel managementApi={api} />);
    await screen.findByRole("heading", { name: "Open problems" });

    await user.click(screen.getByRole("button", { name: "Export support bundle" }));

    expect(await screen.findByText("Support bundle could not be generated")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ref-export-1");
    expect(screen.getByRole("alert")).toHaveTextContent("Retry once");
  });

  it("reports a browser download failure instead of announcing false success", async () => {
    const user = userEvent.setup();
    const createObjectUrl = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: undefined });
    try {
      render(<DiagnosticsPanel managementApi={managementApi()} />);
      await screen.findByRole("heading", { name: "Open problems" });

      await user.click(screen.getByRole("button", { name: "Export support bundle" }));

      expect(await screen.findByText("Support bundle could not be generated")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("cannot create the diagnostics download");
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    }
  });
});

function managementApi(data: DiagnosticsWorkspaceView = workspace()) {
  return {
    getDiagnosticsWorkspace: vi.fn(async () => data),
    exportDiagnostics: vi.fn(async () => basicExport()),
    exportDebugDiagnostics: vi.fn(async () => debugExport())
  };
}

function workspace(): DiagnosticsWorkspaceView {
  return {
    problems: [
      {
        id: "problem-provider",
        area: "providers",
        summary: "Event source disconnected",
        cause: "Twitch WebSocket closed unexpectedly.",
        nextStep: "Reconnect the active event source.",
        severity: "error",
        occurredAt: "2026-07-15T22:42:18.000Z",
        referenceId: "ref-provider-1",
        correction: { label: "Open event sources", route: "/event-sources?diagnostic=ref-provider-1" }
      },
      {
        id: "problem-output",
        area: "outputs",
        summary: "Send test blocked",
        cause: "No browser-source client is connected.",
        nextStep: "Reconnect the browser-source output.",
        severity: "error",
        occurredAt: "2026-07-15T22:41:18.000Z",
        referenceId: "ref-output-1",
        correction: { label: "Open browser sources", route: "/modules/alerts?diagnostic=ref-output-1#browser-sources" }
      }
    ],
    events: [
      {
        id: "event-1",
        providerId: "twitch",
        providerKind: "twitch",
        eventType: "follow",
        occurredAt: "2026-07-15T22:42:13.000Z",
        outcome: "processed",
        test: false,
        referenceId: "ref-event-1",
        processingId: "processing-1",
        actorDisplayName: "Follower",
        alertIds: ["alert-follow"],
        matchedRuleIds: ["rule-follow"],
        playbackStatus: "completed",
        errorMessage: null,
        sanitizedPayload: { userName: "Follower" },
        correction: { label: "Open alert", route: "/modules/alerts/editor/alert-follow?diagnostic=ref-event-1" }
      },
      {
        id: "event-2",
        providerId: "twitch",
        providerKind: "twitch",
        eventType: "subscription",
        occurredAt: "2026-07-15T22:28:07.000Z",
        outcome: "failed",
        test: false,
        referenceId: "ref-event-2",
        processingId: "processing-2",
        actorDisplayName: "viewer42",
        alertIds: ["alert-sub"],
        matchedRuleIds: ["rule-sub"],
        playbackStatus: "failed",
        errorMessage: "Alert rendering failed.",
        sanitizedPayload: { userName: "viewer42", authorization: "[REDACTED]" },
        correction: { label: "Open alert", route: "/modules/alerts/editor/alert-sub?diagnostic=ref-event-2" }
      }
    ],
    rawLogs: [
      {
        id: "log-1",
        timestamp: "2026-07-15T22:42:18.000Z",
        level: "ERROR",
        component: "twitch",
        event: "provider.disconnected",
        referenceId: "ref-runtime-1",
        processingId: null,
        message: "Twitch EventSub socket closed.",
        data: { authorization: "[REDACTED]" },
        correction: { label: "Open event sources", route: "/event-sources?diagnostic=ref-runtime-1" }
      },
      {
        id: "log-2",
        timestamp: "2026-07-15T22:31:44.000Z",
        level: "ERROR",
        component: "overlay",
        event: "test.blocked",
        referenceId: "ref-runtime-2",
        processingId: "processing-2",
        message: "Send test blocked because no client is connected.",
        data: { routeKey: "[REDACTED]" },
        correction: { label: "Open browser sources", route: "/modules/alerts?diagnostic=ref-runtime-2#browser-sources" }
      }
    ]
  };
}

function basicExport(): DiagnosticsExportView {
  return { generatedAt: "2026-07-15T22:45:00.000Z", debugExport: false, rawEventLogs: [], eventLogs: [], alertMatchLogs: [], playbackLogs: [], providerErrors: [], runtimeLogging: null };
}

function debugExport(): DiagnosticsDebugExportView {
  return { ...basicExport(), debugExport: true, runtimeLogEntries: [], runtimeLogTruncated: false };
}
