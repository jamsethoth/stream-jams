import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import type { DiagnosticsDebugExportView, DiagnosticsExportView, DiagnosticsView } from "../management-api.js";

afterEach(() => {
  cleanup();
});

describe("DiagnosticsPanel", () => {
  it("shows empty states for diagnostics sections without records", async () => {
    render(
      <DiagnosticsPanel
        managementApi={{
          getDiagnostics: vi.fn(async () => emptyDiagnostics()),
          exportDiagnostics: vi.fn(async () => emptyExport()),
          exportDebugDiagnostics: vi.fn(async () => emptyDebugExport())
        }}
      />
    );

    expect(await screen.findByText("No event ingestion logs.")).toBeInTheDocument();
    expect(screen.getByText("No alert match logs.")).toBeInTheDocument();
    expect(screen.getByText("No playback logs.")).toBeInTheDocument();
    expect(screen.getByText("No provider errors.")).toBeInTheDocument();
  });

  it("shows load and export errors", async () => {
    const user = userEvent.setup();
    const managementApi = {
      getDiagnostics: vi.fn(async () => {
        throw new Error("Unable to load diagnostics.");
      }),
      exportDiagnostics: vi.fn(async () => {
        throw new Error("Unable to export diagnostics.");
      }),
      exportDebugDiagnostics: vi.fn(async () => emptyDebugExport())
    };
    render(<DiagnosticsPanel managementApi={managementApi} />);

    expect(await screen.findByText("Unable to load diagnostics.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export diagnostics" }));

    expect(await screen.findByText("Unable to export diagnostics.")).toBeInTheDocument();
  });

  it("submits a sanitized fallback limit when the filter is empty", async () => {
    const user = userEvent.setup();
    const managementApi = {
      getDiagnostics: vi.fn(async () => emptyDiagnostics()),
      exportDiagnostics: vi.fn(async () => emptyExport()),
      exportDebugDiagnostics: vi.fn(async () => emptyDebugExport())
    };
    render(<DiagnosticsPanel managementApi={managementApi} />);

    await screen.findByText("No event ingestion logs.");
    const panel = screen.getByRole("heading", { name: "Diagnostics" }).closest("section");
    expect(panel).not.toBeNull();
    await user.clear(within(panel!).getByLabelText("Diagnostics limit"));
    await user.click(within(panel!).getByRole("button", { name: "Reload diagnostics" }));

    expect(managementApi.getDiagnostics).toHaveBeenLastCalledWith({ limit: 50 });
  });

  it("requests a bounded debug export with recent runtime logs", async () => {
    const user = userEvent.setup();
    const managementApi = {
      getDiagnostics: vi.fn(async () => emptyDiagnostics()),
      exportDiagnostics: vi.fn(async () => emptyExport()),
      exportDebugDiagnostics: vi.fn(async () => emptyDebugExport())
    };
    render(<DiagnosticsPanel managementApi={managementApi} />);

    await screen.findByText("No event ingestion logs.");
    await user.click(screen.getByRole("button", { name: "Export with recent logs" }));

    expect(managementApi.exportDebugDiagnostics).toHaveBeenCalledWith({
      limit: 50,
      runtimeLogLimit: 200,
      sinceHours: 2
    });
    expect(await screen.findByText(/with 0 recent runtime log entries/)).toBeInTheDocument();
  });
});

function emptyDiagnostics(): DiagnosticsView {
  return {
    eventLogs: [],
    alertMatchLogs: [],
    playbackLogs: [],
    providerErrors: [],
    runtimeLogging: null
  };
}

function emptyExport(): DiagnosticsExportView {
  return {
    generatedAt: "2026-05-31T02:05:00.000Z",
    debugExport: false,
    rawEventLogs: [],
    ...emptyDiagnostics()
  };
}

function emptyDebugExport(): DiagnosticsDebugExportView {
  return {
    generatedAt: "2026-05-31T02:05:00.000Z",
    debugExport: true,
    rawEventLogs: [],
    runtimeLogEntries: [],
    runtimeLogTruncated: false,
    ...emptyDiagnostics()
  };
}
