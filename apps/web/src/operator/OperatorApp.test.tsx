import type { MergedOperationsSnapshot, OperationRow } from "@stream-jams/core";
import { act, cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorApp } from "./OperatorApp.js";
import { PlaybackOperationsConflictError, type PlaybackApi } from "./playback-api.js";
import type { OperatorTimersApi } from "./timers-api.js";
import { createStaticVideoQueueApi, playingVideo, videoQueue } from "../stories/video-queue-fixtures.js";
import { createHttpVideosApi } from "../management/videos/videos-api.js";

// The lazily loaded Videos panel defaults to the HTTP client; keep tests that do not exercise it on an idle in-memory queue.
vi.mock("../management/videos/videos-api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../management/videos/videos-api.js")>();
  return { ...actual, createHttpVideosApi: vi.fn(() => ({ getQueue: async () => ({ purpose: "live", revision: 1, queuePaused: false, runRemaining: 0, gapEndsAtEpochMs: null, serverTimeEpochMs: Date.now(), mirror: { available: false }, items: [], current: null }) })) };
});
const idleTimersApi: OperatorTimersApi = { listStates: async () => [], adjust: async () => ({ changed: false, state: null }), command: async () => ({ changed: false, state: null }) };

afterEach(() => {
  cleanup();
  delete window.streamJamsDesktop;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OperatorApp", () => {
  it("reports timer-only refresh failure independently and clears it on recovery", async () => {
    vi.useFakeTimers();
    const timersApi: OperatorTimersApi = { listStates: vi.fn().mockRejectedValueOnce(new Error("Timer service unavailable")).mockResolvedValue([]), adjust: async () => ({ changed: false, state: null }), command: vi.fn() };
    render(<OperatorApp api={api()} timersApi={timersApi} />);
    await act(async () => {});
    expect(screen.getByText("Timer state may be stale")).toBeVisible();
    expect(screen.getByText("Large raid")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.queryByText("Timer state may be stale")).not.toBeInTheDocument();
  });
  it("permits desktop quit from the draft-free operator console", () => {
    let request: ((id: string) => void) | undefined;
    const unsubscribe = vi.fn();
    const resolveQuit = vi.fn();
    window.streamJamsDesktop = { onQuitRequested: (listener) => { request = listener; return unsubscribe; }, resolveQuit };
    const { unmount } = render(<OperatorApp timersApi={idleTimersApi} api={api({ getSnapshot: () => new Promise(() => {}) })} />);
    request?.("quit-1");
    expect(resolveQuit).toHaveBeenCalledWith("quit-1", true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("retains a failed timer correction, offers diagnostics, and permits retry", async () => {
    const user = userEvent.setup();
    const timer = { status: "paused" as const, definitionId: "mitts", generation: "g1", remainingMs: 60000,
      snapshot: { id: "mitts", label: "Wear oven mitts", durationMs: 60000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } } };
    const adjust = vi.fn().mockRejectedValueOnce(new Error("Check the local service and retry.")).mockResolvedValue({ changed: true, state: timer });
    render(<OperatorApp api={api()} timersApi={{ listStates: async () => [timer], command: vi.fn(), adjust }} />);
    await screen.findByText("Wear oven mitts");
    await user.click(screen.getByText("Adjust time"));
    await user.clear(screen.getByLabelText("Time (seconds)")); await user.type(screen.getByLabelText("Time (seconds)"), "42");
    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the local service and retry.");
    expect(screen.getByRole("link", { name: "Open diagnostics" })).toBeVisible();
    expect(screen.getByLabelText("Time (seconds)")).toHaveValue(42);
    expect(screen.getByRole("button", { name: "Apply adjustment" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(adjust).toHaveBeenNthCalledWith(2, "mitts", { action: "increment", amountMs: 42000 });
  });
  it("names the source that delivered each item, and none for a manual test", async () => {
    render(<OperatorApp timersApi={idleTimersApi} api={api()} />);
    const summary = async (name: string) => (await screen.findByText(name)).nextElementSibling;
    expect(await summary("Large raid")).toHaveTextContent(/^Viewer One · via Twitch$/u);
    expect(await summary("Flash sweep")).toHaveTextContent(/^Viewer One · via Streamer\.bot$/u);
    expect(await summary("Recent follow")).toHaveTextContent(/^Viewer One$/u);
  });
  it("shows simultaneous current items and real per-module pending positions", async () => {
    render(<OperatorApp timersApi={idleTimersApi} api={api()} />);

    const nowPlaying = await screen.findByRole("heading", { name: "Now playing (2)" });
    const moduleQueues = screen.getByRole("heading", { name: "Module queues" });
    expect(nowPlaying.compareDocumentPosition(moduleQueues) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Large raid")).toBeVisible();
    expect(screen.getByText("Flash sweep")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pending (2)" })).toBeVisible();
    expect(screen.getByText("Cheer burst").closest("article")).toHaveTextContent("#2");
    expect(screen.getByText("Follow alert").closest("article")).toHaveTextContent("#1");
    expect(screen.queryByText("occ-alert")).not.toBeInTheDocument();
  });

  it("shows only active timers and refreshes authoritative state after timer controls", async () => {
    const user = userEvent.setup();
    const running = { status: "running", definitionId: "mitts", generation: "g1", startedAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 60_000,
      snapshot: { id: "mitts", label: "Wear oven mitts", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
        outputs: { browserSource: true, deviceRouteIds: [] } } } as const;
    const timersApi: OperatorTimersApi = { listStates: vi.fn().mockResolvedValueOnce([running]).mockResolvedValueOnce([]), adjust: async () => ({ changed: false, state: null }), command: vi.fn(async () => ({ changed: true, state: null })) };
    render(<OperatorApp api={api()} timersApi={timersApi} />);
    expect(await screen.findByRole("heading", { name: "Active timers (1)" })).toBeVisible(); expect(screen.getByText("Wear oven mitts")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(timersApi.command).toHaveBeenCalledWith("mitts", "stop"); expect(await screen.findByRole("heading", { name: "Active timers (0)" })).toBeVisible();
  });

  it("sends module-qualified skip, remove and replay commands", async () => {
    const user = userEvent.setup();
    const playbackApi = api();
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
    await screen.findByText("Large raid");

    await user.click(screen.getByRole("button", { name: "Skip Flash sweep in Screen Effects" }));
    await user.click(screen.getByRole("button", { name: "Remove Cheer burst from Screen Effects" }));
    await user.click(screen.getByRole("button", { name: "Replay Recent follow in Alerts" }));

    expect(playbackApi.skip).toHaveBeenCalledWith("screen-effects", "occ-effect");
    expect(playbackApi.remove).toHaveBeenCalledWith("screen-effects", "queued-effect");
    expect(playbackApi.replay).toHaveBeenCalledWith("alerts", "recent-alert");
  });

  it("applies the authoritative snapshot returned by a stale command conflict", async () => {
    const user = userEvent.setup();
    const refreshed = {
      ...snapshot(),
      revision: 8,
      current: snapshot().current.filter((item) => item.moduleId !== "screen-effects")
    };
    const playbackApi = api({
      skip: vi.fn(async () => {
        throw new PlaybackOperationsConflictError(
          "The current playback changed before it could be skipped.",
          refreshed
        );
      })
    });
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
    await screen.findByText("Flash sweep");

    await user.click(screen.getByRole("button", { name: "Skip Flash sweep in Screen Effects" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current playback changed before it could be skipped."
    );
    expect(screen.queryByText("Flash sweep")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Now playing (1)" })).toBeVisible();
  });

  it("pauses one module and confirms a scoped clear with count and revision", async () => {
    const user = userEvent.setup();
    const playbackApi = api();
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
    await screen.findByText("Large raid");

    await user.click(screen.getAllByRole("button", { name: "Pause module" })[1]!);
    expect(playbackApi.setModulePaused).toHaveBeenCalledWith("screen-effects", true);

    await user.click(screen.getAllByRole("button", { name: "Clear pending" })[1]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Clear 1 pending Screen Effects item?");
    await user.click(within(dialog).getByRole("button", { name: "Clear pending" }));
    expect(playbackApi.clear).toHaveBeenCalledWith("screen-effects", 1, 7);
  });

  it("contains clear confirmation focus and restores its keyboard trigger on dismissal", async () => {
    const user = userEvent.setup();
    const playbackApi = api();
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
    await screen.findByText("Large raid");
    const trigger = screen.getAllByRole("button", { name: "Clear pending" })[1]!;

    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Clear pending" });
    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(playbackApi.clear).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    expect(playbackApi.clear).not.toHaveBeenCalled();
  });

  it("restores clear confirmation focus to the module heading when refresh disables the trigger", async () => {
    vi.useFakeTimers();
    const refreshed = { ...snapshot(), revision: 8, queued: snapshot().queued.filter((item) => item.moduleId !== "screen-effects") };
    const getSnapshot = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValue(refreshed);
    render(<OperatorApp timersApi={idleTimersApi} api={api({ getSnapshot })} />);
    await act(async () => { await Promise.resolve(); });
    const trigger = screen.getAllByRole("button", { name: "Clear pending" })[1]!;
    trigger.focus();
    await act(async () => { trigger.click(); });
    expect(screen.getByRole("dialog")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(trigger).toBeDisabled();
    // Mantine's modal handles Escape from the focused element inside the dialog, as a real keypress does.
    await act(async () => { fireEvent.keyDown(document.activeElement ?? screen.getByRole("dialog"), { key: "Escape" }); });

    expect(screen.getByRole("heading", { name: "Screen Effects" })).toHaveFocus();
  });

  it("shows independent module mute and applies All to a mixed policy", async () => {
    const playbackApi = api({ getSnapshot: async () => ({ ...snapshot(), moduleMutes: { alerts: true, "screen-effects": false } }) });
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
    expect(await screen.findByText("Alerts muted")).toBeVisible();
    expect(screen.getByText("Effects audio on")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Mute Alerts and Effects" }));
    expect(playbackApi.mute).toHaveBeenCalledOnce();
    expect(playbackApi.unmute).not.toHaveBeenCalled();
  });

  it("runs global safety as one pending command and announces the result", async () => {
    const user = userEvent.setup();
    const response = deferred<MergedOperationsSnapshot>();
    const playbackApi = api({ pause: () => response.promise });
    render(<OperatorApp timersApi={idleTimersApi} api={playbackApi} />);
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
    render(<OperatorApp timersApi={idleTimersApi} api={api({ getSnapshot })} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Large raid")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("Playback state may be stale");
    expect(screen.getByText("Large raid")).toBeVisible();
  });

  it("loads the Videos queue panel lazily and attributes default requests to the Operator", async () => {
    render(<OperatorApp api={api()} timersApi={idleTimersApi} />);
    expect(await screen.findByRole("heading", { name: "Video queue" })).toBeVisible();
    expect(vi.mocked(createHttpVideosApi)).toHaveBeenCalledWith({ from: "operator" });
  });

  it("operates the Videos queue from the Operator Console with keyboard-reachable controls", async () => {
    const user = userEvent.setup();
    const command = vi.fn(async () => videoQueue());
    const control = vi.fn(async () => playingVideo("paused"));
    const submit = vi.fn(async () => playingVideo().items[1]!);
    render(<OperatorApp api={api()} timersApi={idleTimersApi} videosApi={createStaticVideoQueueApi(playingVideo(), { command, control, submit })} />);
    const card = await screen.findByRole("article", { name: "Now playing" });
    expect(within(card).getByText("Now playing clip")).toBeVisible();
    expect(within(card).getByRole("slider", { name: "Seek" })).toBeVisible();
    within(card).getByRole("button", { name: "Pause video" }).focus();
    await user.keyboard("{Enter}");
    expect(control).toHaveBeenCalledWith("live", "pause", "now", undefined);
    await user.click(await screen.findByRole("button", { name: "Play next" }));
    expect(command).toHaveBeenCalledWith("live", 4, { kind: "play-next" });
    await user.type(screen.getByLabelText("Video link"), "https://youtu.be/abc{Enter}");
    expect(submit).toHaveBeenCalledWith("live", { link: "https://youtu.be/abc", title: "" });
  });

  it("shows an actionable initial error without inventing playback state", async () => {
    render(<OperatorApp timersApi={idleTimersApi} api={api({ getSnapshot: async () => { throw new ManagementHttpError("Session failed", "SESSION", "ref-1"); } })} />);
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
    source: input.source === undefined ? "twitch" : input.source,
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
      operation({ moduleId: "screen-effects", occurrenceId: "occ-effect", name: "Flash sweep", status: "playing", source: "streamerbot" })
    ],
    queued: [
      operation({ moduleId: "screen-effects", occurrenceId: "queued-effect", name: "Cheer burst", moduleQueuePosition: 2 }),
      operation({ moduleId: "alerts", occurrenceId: "queued-alert", name: "Follow alert", moduleQueuePosition: 1 })
    ],
    recent: [operation({ moduleId: "alerts", occurrenceId: "recent-alert", name: "Recent follow", status: "completed", source: null, completedAtMs: Date.parse("2026-09-13T12:01:00.000Z") })],
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
