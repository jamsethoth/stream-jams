import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import type { DiagnosticsExportView, DiagnosticsView } from "../management-api.js";

afterEach(() => {
  cleanup();
});

describe("DiagnosticsPanel", () => {
  it("shows empty states for diagnostics sections without records", async () => {
    render(
      <DiagnosticsPanel
        managementApi={{
          getDiagnostics: vi.fn(async () => emptyDiagnostics()),
          exportDiagnostics: vi.fn(async () => emptyExport())
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
      })
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
      exportDiagnostics: vi.fn(async () => emptyExport())
    };
    render(<DiagnosticsPanel managementApi={managementApi} />);

    await screen.findByText("No event ingestion logs.");
    const panel = screen.getByRole("heading", { name: "Diagnostics" }).closest("section");
    expect(panel).not.toBeNull();
    await user.clear(within(panel!).getByLabelText("Diagnostics limit"));
    await user.click(within(panel!).getByRole("button", { name: "Reload diagnostics" }));

    expect(managementApi.getDiagnostics).toHaveBeenLastCalledWith({ limit: 50 });
  });
});

function emptyDiagnostics(): DiagnosticsView {
  return {
    eventLogs: [],
    alertMatchLogs: [],
    playbackLogs: [],
    providerErrors: []
  };
}

function emptyExport(): DiagnosticsExportView {
  return {
    generatedAt: "2026-05-31T02:05:00.000Z",
    rawEventLogs: [],
    ...emptyDiagnostics()
  };
}
