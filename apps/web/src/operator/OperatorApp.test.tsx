import type { PlaybackQueueItem, PlaybackQueueSnapshot } from "@stream-jams/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorApp } from "./OperatorApp.js";
import type { PlaybackApi } from "./playback-api.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OperatorApp", () => {
  it("places management navigation in the shared header action position", async () => {
    render(<OperatorApp api={createApi({ getSnapshot: async () => snapshot() })} />);

    const link = await screen.findByRole("link", { name: "Back to management" });
    expect(link).toHaveAttribute("href", "/manage");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass("surface-switch-link");
  });

  it("renders loading, idle, active, queued, and recent playback states without raw payload data", async () => {
    const load = deferred<PlaybackQueueSnapshot>();
    const api = createApi({ getSnapshot: () => load.promise });
    const { rerender } = render(<OperatorApp api={api} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading playback state");
    load.resolve(snapshot());
    expect(await screen.findByText("No alert is playing.")).toBeInTheDocument();

    rerender(<OperatorApp api={createApi({ getSnapshot: async () => activeSnapshot() })} />);
    expect(await screen.findByText("Viewer One")).toBeInTheDocument();
    expect(screen.getAllByText("Follow")).toHaveLength(3);
    expect(screen.getByText("2 alerts")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Up next (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent (1)" })).toBeInTheDocument();
    expect(screen.queryByText("private message")).not.toBeInTheDocument();
    expect(screen.queryByText("secret metadata")).not.toBeInTheDocument();
    expect(screen.queryByText("item-current")).not.toBeInTheDocument();
  });

  it("runs safety controls through one pending command and announces the command response", async () => {
    const user = userEvent.setup();
    const pause = deferred<PlaybackQueueSnapshot>();
    const api = createApi({
      getSnapshot: async () => activeSnapshot(),
      pause: () => pause.promise
    });
    render(<OperatorApp api={api} />);
    const pauseButton = await screen.findByRole("button", { name: "Pause queue" });

    await user.click(pauseButton);
    expect(pauseButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mute alert audio" })).toBeDisabled();
    pause.resolve({ ...activeSnapshot(), paused: true });

    expect(await screen.findByRole("button", { name: "Resume queue" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Queue paused. Current alert continues.");
    expect(screen.getByText("Current alert continues; queued alerts wait.")).toBeInTheDocument();
  });

  it("supports mute, do-not-disturb, skip, and replay with accessible pressed state", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getSnapshot: async () => activeSnapshot(),
      mute: vi.fn(async () => ({ ...activeSnapshot(), muted: true })),
      setDoNotDisturb: vi.fn(async () => ({ ...activeSnapshot(), doNotDisturb: true })),
      skip: vi.fn(async () => ({ ...activeSnapshot(), current: null })),
      replay: vi.fn(async () => ({ ...activeSnapshot(), current: activeSnapshot().recent[0] ?? null }))
    });
    render(<OperatorApp api={api} />);

    await user.click(await screen.findByRole("button", { name: "Mute alert audio" }));
    expect(api.mute).toHaveBeenCalledOnce();
    expect(screen.getByText(/Speech already handed to an external provider may continue/)).toBeInTheDocument();

    const dnd = screen.getByRole("button", { name: "Enable do-not-disturb" });
    await user.click(dnd);
    expect(api.setDoNotDisturb).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Disable do-not-disturb" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Skip current alert" }));
    expect(api.skip).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Now playing" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /Replay Follow from Recent Viewer/ }));
    expect(api.replay).toHaveBeenCalledWith("item-recent");
  });

  it("retains the last snapshot, reports stale polling, and links a safe reference to diagnostics", async () => {
    vi.useFakeTimers();
    const api = createApi({
      getSnapshot: vi.fn()
        .mockResolvedValueOnce(activeSnapshot())
        .mockRejectedValue(new ManagementHttpError("Unable to refresh.", "PLAYBACK_READ_FAILED", "ref-poll-1"))
    });
    render(<OperatorApp api={api} />);
    await act(async () => await Promise.resolve());
    expect(screen.getByText("Viewer One")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByText("Viewer One")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Playback state may be stale");
    expect(screen.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute(
      "href",
      "/manage/diagnostics?reference=ref-poll-1"
    );
  });

  it("shows an initial failure with retry and recovers", async () => {
    const user = userEvent.setup();
    const getSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(snapshot());
    render(<OperatorApp api={createApi({ getSnapshot })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load playback state");
    expect(screen.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute("href", "/manage/diagnostics");
    await user.click(screen.getByRole("button", { name: "Retry loading playback state" }));

    expect(await screen.findByText("No alert is playing.")).toBeInTheDocument();
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard focus on a failed command control", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getSnapshot: async () => activeSnapshot(),
      pause: async () => { throw new ManagementHttpError("Pause refused.", "PLAYBACK_WRITE_FAILED", "ref-command-1"); }
    });
    render(<OperatorApp api={api} />);
    const pauseButton = await screen.findByRole("button", { name: "Pause queue" });

    pauseButton.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Pause refused.");
    expect(pauseButton).toHaveFocus();
  });

  it("lets a command response win over an older poll response", async () => {
    vi.useFakeTimers();
    const poll = deferred<PlaybackQueueSnapshot>();
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce(activeSnapshot())
      .mockImplementationOnce(() => poll.promise);
    const api = createApi({
      getSnapshot,
      pause: async () => ({ ...activeSnapshot(), paused: true })
    });
    render(<OperatorApp api={api} />);
    await act(async () => await Promise.resolve());
    expect(screen.getByRole("button", { name: "Pause queue" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      screen.getByRole("button", { name: "Pause queue" }).click();
    });
    await act(async () => await Promise.resolve());
    expect(screen.getByRole("button", { name: "Resume queue" })).toBeInTheDocument();

    poll.resolve(activeSnapshot());
    await act(async () => await Promise.resolve());
    expect(screen.getByRole("button", { name: "Resume queue" })).toBeInTheDocument();
  });

  it("pauses polling while hidden and refreshes immediately when visible", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const getSnapshot = vi.fn(async () => activeSnapshot());
    render(<OperatorApp api={createApi({ getSnapshot })} />);
    await act(async () => await Promise.resolve());
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => void await vi.advanceTimersByTimeAsync(20_000));
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps one polling loop when visibility changes during an in-flight request", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const first = deferred<PlaybackQueueSnapshot>();
    const second = deferred<PlaybackQueueSnapshot>();
    const getSnapshot = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValue(activeSnapshot());
    render(<OperatorApp api={createApi({ getSnapshot })} />);
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(getSnapshot).toHaveBeenCalledTimes(2);

    second.resolve(activeSnapshot());
    first.resolve(activeSnapshot());
    await act(async () => await Promise.resolve());
    await act(async () => void await vi.advanceTimersByTimeAsync(2_000));

    expect(getSnapshot).toHaveBeenCalledTimes(3);
  });

  it("bounds refresh retry delays at two, four, eight, and fifteen seconds", async () => {
    vi.useFakeTimers();
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce(activeSnapshot())
      .mockRejectedValue(new Error("refresh failed"));
    render(<OperatorApp api={createApi({ getSnapshot })} />);
    await act(async () => await Promise.resolve());

    await act(async () => void await vi.advanceTimersByTimeAsync(2_000));
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => void await vi.advanceTimersByTimeAsync(2_000));
    expect(getSnapshot).toHaveBeenCalledTimes(3);
    await act(async () => void await vi.advanceTimersByTimeAsync(4_000));
    expect(getSnapshot).toHaveBeenCalledTimes(4);
    await act(async () => void await vi.advanceTimersByTimeAsync(8_000));
    expect(getSnapshot).toHaveBeenCalledTimes(5);
    await act(async () => void await vi.advanceTimersByTimeAsync(15_000));
    expect(getSnapshot).toHaveBeenCalledTimes(6);
  });
});

function createApi(overrides: Partial<PlaybackApi> = {}): PlaybackApi {
  return {
    getSnapshot: vi.fn(async () => snapshot()),
    pause: vi.fn(async () => ({ ...snapshot(), paused: true })),
    resume: vi.fn(async () => ({ ...snapshot(), paused: false })),
    mute: vi.fn(async () => ({ ...snapshot(), muted: true })),
    unmute: vi.fn(async () => ({ ...snapshot(), muted: false })),
    setDoNotDisturb: vi.fn(async (enabled) => ({ ...snapshot(), doNotDisturb: enabled })),
    skip: vi.fn(async () => snapshot()),
    replay: vi.fn(async () => snapshot()),
    ...overrides
  };
}

function snapshot(): PlaybackQueueSnapshot {
  return { current: null, queued: [], recent: [], paused: false, muted: false, doNotDisturb: false };
}

function activeSnapshot(): PlaybackQueueSnapshot {
  return {
    ...snapshot(),
    current: item("item-current", "playing", "Viewer One", 2),
    queued: [item("item-queued", "queued", "Next Viewer", 1)],
    recent: [item("item-recent", "completed", "Recent Viewer", 1)]
  };
}

function item(id: string, status: PlaybackQueueItem["status"], actor: string, alertCount: number): PlaybackQueueItem {
  return {
    id,
    sourceEvent: {
      id: `event-${id}`,
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "twitch",
      occurredAt: "2026-07-21T12:00:00.000Z",
      actor: { id: "user-1", displayName: actor },
      message: "private message",
      metadata: { internal: "secret metadata" },
      type: "follow",
      amount: null
    },
    alerts: Array.from({ length: alertCount }, (_, index) => ({
      id: `alert-${index}`,
      sourceEventId: `event-${id}`,
      ruleId: `rule-${index}`,
      variantId: `variant-${index}`,
      overlayInstruction: {
        id: `instruction-${index}`,
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        visual: null,
        audio: { assetId: `asset-${index}`, volume: 1 },
        text: null,
        tts: null,
        durationMs: 3_000
      }
    })),
    priority: 10,
    status,
    enqueuedAt: "2026-07-21T12:00:01.000Z",
    startedAt: status === "queued" ? null : "2026-07-21T12:00:02.000Z",
    completedAt: status === "completed" ? "2026-07-21T12:00:05.000Z" : null
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
