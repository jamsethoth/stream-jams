import type { MergedOperationsSnapshot, OperationRow } from "@stream-jams/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorApp } from "./OperatorApp.js";
import type { PlaybackApi } from "./playback-api.js";

afterEach(() => {
  cleanup();
  delete window.streamJamsDesktop;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OperatorApp", () => {
  it("permits desktop quit from the draft-free operator console", () => {
    let request: ((id: string) => void) | undefined;
    const unsubscribe = vi.fn();
    const resolveQuit = vi.fn();
    window.streamJamsDesktop = { onQuitRequested: (listener) => { request = listener; return unsubscribe; }, resolveQuit };
    const { unmount } = render(<OperatorApp api={api({ getSnapshot: () => new Promise(() => {}) })} />);
    request?.("quit-1");
    expect(resolveQuit).toHaveBeenCalledWith("quit-1", true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("shows simultaneous current items and real per-module pending positions", async () => {
    render(<OperatorApp api={api()} />);

    expect(await screen.findByRole("heading", { name: "Now playing (2)" })).toBeVisible();
    expect(screen.getByText("Large raid")).toBeVisible();
    expect(screen.getByText("Flash sweep")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pending (2)" })).toBeVisible();
    expect(screen.getByText("Cheer burst").closest("article")).toHaveTextContent("#2");
    expect(screen.getByText("Follow alert").closest("article")).toHaveTextContent("#1");
    expect(screen.queryByText("occ-alert")).not.toBeInTheDocument();
  });

  it("sends module-qualified skip, remove and replay commands", async () => {
    const user = userEvent.setup();
    const playbackApi = api();
    render(<OperatorApp api={playbackApi} />);
    await screen.findByText("Large raid");

    await user.click(screen.getByRole("button", { name: "Skip Flash sweep in Screen Effects" }));
    await user.click(screen.getByRole("button", { name: "Remove Cheer burst from Screen Effects" }));
    await user.click(screen.getByRole("button", { name: "Replay Recent follow in Alerts" }));

    expect(playbackApi.skip).toHaveBeenCalledWith("screen-effects", "occ-effect");
    expect(playbackApi.remove).toHaveBeenCalledWith("screen-effects", "queued-effect");
    expect(playbackApi.replay).toHaveBeenCalledWith("alerts", "recent-alert");
  });

  it("pauses one module and confirms a scoped clear with count and revision", async () => {
    const user = userEvent.setup();
    const playbackApi = api();
    render(<OperatorApp api={playbackApi} />);
    await screen.findByText("Large raid");

    await user.click(screen.getAllByRole("button", { name: "Pause module" })[1]!);
    expect(playbackApi.setModulePaused).toHaveBeenCalledWith("screen-effects", true);

    await user.click(screen.getAllByRole("button", { name: "Clear pending" })[1]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Clear 1 pending Screen Effects item?");
    await user.click(within(dialog).getByRole("button", { name: "Clear pending" }));
    expect(playbackApi.clear).toHaveBeenCalledWith("screen-effects", 1, 7);
  });

  it("runs global safety as one pending command and announces the result", async () => {
    const user = userEvent.setup();
    const response = deferred<MergedOperationsSnapshot>();
    const playbackApi = api({ pause: () => response.promise });
    render(<OperatorApp api={playbackApi} />);
    const button = await screen.findByRole("button", { name: "Pause all queues" });

    await user.click(button);
    expect(button).toBeDisabled();
    response.resolve({ ...snapshot(), paused: true });

    expect(await screen.findByRole("button", { name: "Resume all queues" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("All queues paused");
  });

  it("retains last-known state and labels refresh failures as stale", async () => {
    vi.useFakeTimers();
    const getSnapshot = vi.fn().mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("offline"));
    render(<OperatorApp api={api({ getSnapshot })} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Large raid")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("Playback state may be stale");
    expect(screen.getByText("Large raid")).toBeVisible();
  });

  it("shows an actionable initial error without inventing playback state", async () => {
    render(<OperatorApp api={api({ getSnapshot: async () => { throw new ManagementHttpError("Session failed", "SESSION", "ref-1"); } })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Session failed");
    expect(screen.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute("href", "/manage/diagnostics?reference=ref-1");
  });
});

function operation(input: Partial<OperationRow> & Pick<OperationRow, "moduleId" | "occurrenceId" | "name">): OperationRow {
  return {
    moduleId: input.moduleId,
    occurrenceId: input.occurrenceId,
    name: input.name,
    summary: input.summary ?? "Viewer One",
    status: input.status ?? "queued",
    enqueuedAtMs: input.enqueuedAtMs ?? Date.parse("2026-09-13T12:00:00.000Z"),
    completedAtMs: input.completedAtMs ?? null,
    sequence: input.sequence ?? 0,
    moduleQueuePosition: input.moduleQueuePosition ?? null
  };
}

function snapshot(): MergedOperationsSnapshot {
  return {
    revision: 7,
    owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
    current: [
      operation({ moduleId: "alerts", occurrenceId: "occ-alert", name: "Large raid", status: "playing" }),
      operation({ moduleId: "screen-effects", occurrenceId: "occ-effect", name: "Flash sweep", status: "playing" })
    ],
    queued: [
      operation({ moduleId: "screen-effects", occurrenceId: "queued-effect", name: "Cheer burst", moduleQueuePosition: 2 }),
      operation({ moduleId: "alerts", occurrenceId: "queued-alert", name: "Follow alert", moduleQueuePosition: 1 })
    ],
    recent: [operation({ moduleId: "alerts", occurrenceId: "recent-alert", name: "Recent follow", status: "completed", completedAtMs: Date.parse("2026-09-13T12:01:00.000Z") })],
    paused: false,
    muted: false,
    doNotDisturb: false
  };
}

function api(overrides: Partial<PlaybackApi> = {}): PlaybackApi {
  const same = async () => snapshot();
  return {
    getSnapshot: vi.fn(same),
    pause: vi.fn(async () => ({ ...snapshot(), paused: true })),
    resume: vi.fn(same),
    mute: vi.fn(async () => ({ ...snapshot(), muted: true })),
    unmute: vi.fn(same),
    setDoNotDisturb: vi.fn(async (enabled) => ({ ...snapshot(), doNotDisturb: enabled })),
    skip: vi.fn(same),
    remove: vi.fn(same),
    replay: vi.fn(same),
    clear: vi.fn(same),
    setModulePaused: vi.fn(async (moduleId, paused) => ({ ...snapshot(), owners: snapshot().owners.map((owner) => owner.moduleId === moduleId ? { ...owner, paused } : owner) })),
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
