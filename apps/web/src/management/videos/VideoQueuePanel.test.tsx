import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaticVideoQueueApi, describedRecentVideos, describedVideos, failedVideos, heldVideos, playingVideo, queuedVideos, recentVideo, recentVideos, twitchClipPlaying, videoQueue } from "../../stories/video-queue-fixtures.js";
import { renderManagement } from "../../test-support/render-management.js";
import { ManagementHttpError } from "../management-http-client.js";
import { OperatorItemCard } from "../../operator/OperatorItemCard.js";
import { VideoQueuePanel } from "./VideoQueuePanel.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const conflict = () => new ManagementHttpError("The video queue changed. Refresh before trying again. (VIDEO_QUEUE_CONFLICT)", "VIDEO_QUEUE_CONFLICT", null, null, [], [], 409);

describe("VideoQueuePanel", () => {
  it("shows an empty queue with disabled play controls", async () => {
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(videoQueue())} />);
    expect(await screen.findByText("No videos are waiting. Add a link below or wait for requests.")).toBeVisible();
    expect(screen.getByText("Nothing is playing.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Play next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Play all now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear queue" })).toBeDisabled();
  });

  it("plays next and plays all with the observed revision", async () => {
    const user = userEvent.setup();
    const command = vi.fn(async () => queuedVideos());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { command })} />);
    await user.click(await screen.findByRole("button", { name: "Play next" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "play-next" });
    expect(await screen.findByText("Playing the next video.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Play all now" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "play-all" });
    expect(await screen.findByText("Playing 3 queued videos in order.")).toBeVisible();
  });

  it("pauses and resumes the queue", async () => {
    const user = userEvent.setup();
    const command = vi.fn()
      .mockResolvedValueOnce(videoQueue({ ...queuedVideos(), queuePaused: true, revision: 5 }))
      .mockResolvedValueOnce(videoQueue({ ...queuedVideos(), queuePaused: false, revision: 6 }));
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { command })} pollIntervalMs={60_000} />);
    await user.click(await screen.findByRole("button", { name: "Pause queue" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "pause-queue" });
    expect(await screen.findByText("Queue paused")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume queue" }));
    expect(command).toHaveBeenLastCalledWith("live", 5, { kind: "resume-queue" });
    expect(await screen.findByRole("button", { name: "Pause queue" })).toBeVisible();
  });

  it("shows the over-limit hold, plays a held item anyway, and lists unknown-length items as queued", async () => {
    const user = userEvent.setup();
    const command = vi.fn(async () => heldVideos());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(heldVideos(), { command })} />);
    const concert = await screen.findByRole("article", { name: "Full concert" });
    expect(within(concert).getByText("Over the length limit")).toBeVisible();
    const mystery = screen.getByRole("article", { name: "Mystery link" });
    expect(within(mystery).getByText(/Length unknown/u)).toBeVisible();
    expect(within(mystery).getByText("Queued")).toBeVisible();
    expect(mystery.querySelector(".video-queue__hold")).toBeNull();
    expect(within(mystery).queryByRole("button", { name: /Play anyway/u })).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Short clip" })).queryByRole("button", { name: /Play anyway/u })).not.toBeInTheDocument();
    await user.click(within(concert).getByRole("button", { name: "Play anyway: Full concert" }));
    expect(command).toHaveBeenCalledWith("live", 4, { kind: "play-anyway", itemId: "long" });
  });

  describe("provider details", () => {
    it("titles each row by the submitted title, then the provider's, then the link, with the channel beside the length", async () => {
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(describedVideos())} pollIntervalMs={60_000} />);
      const rows = (await screen.findAllByRole("article")).filter(row => row.classList.contains("video-queue__item"));
      expect(rows.map(row => row.getAttribute("aria-label"))).toEqual([
        "Never Gonna Give You Up (Official Video)", "Clutch final round", "Full charity marathon", "Viewer's pick", "https://videos.example.com/clip.mp4"
      ]);
      const bylines = rows.map(row => row.querySelector(".video-queue__byline")?.textContent);
      expect(bylines).toEqual(["Rick Astley · Length unknown", "SpeedyStreamer · 0:28", "SpeedyStreamer · 1:12:03", "Some Channel · Length unknown", "Length unknown"]);
      expect(within(rows[0]!).getByText("Requested by viewer_one · YouTube · via Streamer.bot")).toBeVisible();
      expect(within(rows[2]!).getByText("Over the length limit")).toBeVisible();
      expect(screen.getByRole("button", { name: "Play anyway: Full charity marathon" })).toBeEnabled();
      // The provider title is stored beside a submitted one but not shown over it.
      expect(screen.queryByText("Provider title is kept beside it")).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/undefined|null/u);
    });

    it("names actions with the provider title when no title was submitted", async () => {
      const user = userEvent.setup();
      const command = vi.fn(async () => describedVideos());
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(describedVideos(), { command })} pollIntervalMs={60_000} />);
      await user.click(await screen.findByRole("button", { name: "Remove: Never Gonna Give You Up (Official Video)" }));
      expect(command).toHaveBeenCalledWith("live", 4, { kind: "remove", itemId: "yt" });
      expect(await screen.findByText("Never Gonna Give You Up (Official Video) removed.")).toBeVisible();
    });

    it("shows the channel on the now-playing card", async () => {
      const now = Date.now();
      const playing = videoQueue({ serverTimeEpochMs: now, items: [{ ...describedVideos().items[1]!, status: "playing" }],
        current: { itemId: "clip", phase: "playing", positionMs: 1_000, atEpochMs: now, durationMs: 28_400, controls: { pause: false, seek: false } } });
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(playing)} pollIntervalMs={60_000} />);
      const card = await screen.findByRole("article", { name: "Now playing" });
      expect(within(card).getByText("Clutch final round")).toBeVisible();
      expect(within(card).getByText("SpeedyStreamer · Requested by viewer_one · Twitch clip")).toBeVisible();
      expect(within(card).getByLabelText("Playback position")).toHaveTextContent("/ 0:28");
    });

    it("leads Operator Recent summaries with the channel", async () => {
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(describedRecentVideos())} pollIntervalMs={60_000} recentCard={OperatorItemCard} />);
      const recent = await screen.findByRole("region", { name: "Recent videos" });
      const cards = within(recent).getAllByRole("article");
      expect(cards.map(card => card.getAttribute("aria-label"))).toEqual(["Never Gonna Give You Up (Official Video)", "Viewer's pick"]);
      expect(cards[0]).toHaveTextContent("Rick Astley · Requested by viewer_one · YouTube · youtu.be · via channel points");
      expect(within(recent).getByRole("button", { name: "Replay Viewer's pick in Videos" })).toBeEnabled();
    });
  });

  it("lists recent failures apart from the waiting queue, without controls", async () => {
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(failedVideos())} />);
    const failed = await screen.findByRole("article", { name: "Removed upload" });
    expect(within(failed).getByText("Failed")).toBeVisible();
    expect(within(failed).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Failed recently (1)")).toBeVisible();
    expect(screen.getByText("Waiting (1)")).toBeVisible();
  });

  it("keeps management on the failed-only list without Recent", async () => {
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi({ ...failedVideos(), recent: recentVideos().recent })} />);
    expect(await screen.findByText("Failed recently (1)")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Recent videos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Replay/u })).not.toBeInTheDocument();
  });

  describe("Operator Recent", () => {
    it("lists finished videos newest first with requester, host, channel, outcome and finish time", async () => {
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(recentVideos())} recentCard={OperatorItemCard} />);
      const recent = await screen.findByRole("region", { name: "Recent videos" });
      expect(within(recent).getByRole("heading", { name: "Recent (3)" })).toBeVisible();
      const cards = within(recent).getAllByRole("article");
      expect(cards.map(card => card.getAttribute("aria-label"))).toEqual(["Cat plays keyboard", "Removed upload", "https://videos.example.com/clip.mp4"]);
      expect(cards[0]).toHaveTextContent("Requested by viewer_one · YouTube · youtu.be · via channel points");
      expect(within(cards[0]!).getByText("Played")).toBeVisible();
      expect(within(cards[0]!).getByText(/2026/u)).toBeVisible();
      expect(within(cards[1]!).getByText("Failed")).toBeVisible();
      expect(cards[2]).toHaveTextContent("Direct file · videos.example.com · via Operator");
      // Failures are part of Recent here, so the separate failed-only list is not repeated.
      expect(screen.queryByText(/Failed recently/u)).not.toBeInTheDocument();
    });

    it("shows an empty Recent list", async () => {
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(videoQueue())} recentCard={OperatorItemCard} />);
      const recent = await screen.findByRole("region", { name: "Recent videos" });
      expect(within(recent).getByText("No videos have finished yet.")).toBeVisible();
    });

    it("replays from the keyboard with the observed revision and keeps focus on Replay", async () => {
      const user = userEvent.setup();
      const replayed = videoQueue({ ...recentVideos(), revision: 5, items: [...recentVideos().items, { ...recentVideo("again", { title: "Cat plays keyboard", submittedVia: "operator" }), status: "queued", position: 6 }] });
      const requeue = vi.fn(async () => replayed);
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(recentVideos(), { requeue })} pollIntervalMs={60_000} recentCard={OperatorItemCard} />);
      const replay = await screen.findByRole("button", { name: "Replay Cat plays keyboard in Videos" });
      replay.focus();
      await user.keyboard("{Enter}");
      expect(requeue).toHaveBeenCalledWith("live", 4, "done");
      expect(await screen.findByText("Cat plays keyboard added to the live video queue.")).toBeVisible();
      expect(screen.getByText("Waiting (2)")).toBeVisible();
      await waitFor(() => expect(screen.getByRole("button", { name: "Replay Cat plays keyboard in Videos" })).toHaveFocus());
    });

    it("reports a replay the server rejects and refreshes after a conflict", async () => {
      const user = userEvent.setup();
      const requeue = vi.fn()
        .mockRejectedValueOnce(new ManagementHttpError("That link is no longer allowed. Add its host in Videos settings to replay it.", "VIDEO_REQUEST_REJECTED", null, null, [], [], 422))
        .mockRejectedValueOnce(conflict());
      const getQueue = vi.fn(async () => recentVideos());
      renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(recentVideos(), { requeue, getQueue })} pollIntervalMs={60_000} recentCard={OperatorItemCard} />);
      await user.click(await screen.findByRole("button", { name: "Replay https://videos.example.com/clip.mp4 in Videos" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("That link is no longer allowed.");
      const calls = getQueue.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Replay Removed upload in Videos" }));
      expect(await screen.findByText("The queue changed; try again.")).toBeVisible();
      expect(getQueue.mock.calls.length).toBeGreaterThan(calls);
    });
  });

  it("reorders and removes waiting items", async () => {
    const user = userEvent.setup();
    const command = vi.fn(async () => queuedVideos());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { command })} />);
    expect(await screen.findByRole("button", { name: "Move up: Cat plays keyboard" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move down: Cat plays keyboard" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "reorder", itemIds: ["b", "a", "c"] });
    await user.click(screen.getByRole("button", { name: "Remove: Speedrun highlight" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "remove", itemId: "b" });
  });

  it("asks for confirmation before clearing and cancels without a command", async () => {
    const user = userEvent.setup();
    const command = vi.fn(async () => videoQueue());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { command })} />);
    await user.click(await screen.findByRole("button", { name: "Clear queue" }));
    const dialog = await screen.findByRole("dialog", { name: "Clear 3 waiting videos?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(command).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear queue" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Clear queue" }));
    expect(command).toHaveBeenCalledWith("live", 4, { kind: "clear" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Waiting videos cleared.")).toBeVisible();
  });

  it("keeps a failed clear in the review for retry", async () => {
    const user = userEvent.setup();
    const command = vi.fn().mockRejectedValueOnce(new Error("Local service unavailable")).mockResolvedValue(videoQueue());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { command })} />);
    await user.click(await screen.findByRole("button", { name: "Clear queue" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Clear queue" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Local service unavailable");
    await user.click(within(dialog).getByRole("button", { name: "Clear queue" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows now playing with pause, seek, skip and stop", async () => {
    const user = userEvent.setup();
    const control = vi.fn(async () => playingVideo("paused"));
    const command = vi.fn(async () => videoQueue());
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(playingVideo(), { control, command })} pollIntervalMs={60_000} />);
    const card = await screen.findByRole("article", { name: "Now playing" });
    expect(within(card).getByText("Now playing clip")).toBeVisible();
    expect(within(card).getByText(/Requested by viewer_one/u)).toBeVisible();
    expect(within(card).getByLabelText("Playback position")).toHaveTextContent("1:20 / 3:00");
    const seek = within(card).getByRole("slider", { name: "Seek" });
    fireEvent.change(seek, { target: { value: "120000" } });
    fireEvent.keyUp(seek, { key: "ArrowRight" });
    await waitFor(() => expect(control).toHaveBeenCalledWith("live", "seek", "now", 120_000));
    await user.click(within(await screen.findByRole("article", { name: "Now playing" })).getByRole("button", { name: "Resume video" }));
    expect(control).toHaveBeenLastCalledWith("live", "resume", "now", undefined);
    await user.click(within(screen.getByRole("article", { name: "Now playing" })).getByRole("button", { name: "Skip" }));
    expect(command).toHaveBeenLastCalledWith("live", 4, { kind: "skip" });
  });

  it("pauses a playing video", async () => {
    const user = userEvent.setup();
    const control = vi.fn(async () => playingVideo("paused"));
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(playingVideo(), { control })} />);
    await user.click(await screen.findByRole("button", { name: "Pause video" }));
    expect(control).toHaveBeenCalledWith("live", "pause", "now", undefined);
    expect(await screen.findByText("Now playing clip paused.")).toBeVisible();
  });

  it("explains why a Twitch clip cannot be paused or sought", async () => {
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(twitchClipPlaying())} />);
    expect(await screen.findByText("This player cannot be paused or sought. Skip and Stop still work.")).toBeVisible();
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause video" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  });

  it("refreshes after a revision conflict and asks to try again", async () => {
    const user = userEvent.setup();
    const refreshed = videoQueue({ ...queuedVideos(), revision: 9 });
    const getQueue = vi.fn().mockResolvedValueOnce(queuedVideos()).mockResolvedValue(refreshed);
    const command = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValue(refreshed);
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { getQueue, command })} pollIntervalMs={60_000} />);
    await user.click(await screen.findByRole("button", { name: "Play next" }));
    expect(await screen.findByText("The queue changed; try again.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getQueue).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Play next" }));
    expect(command).toHaveBeenLastCalledWith("live", 9, { kind: "play-next" });
  });

  it("shows a command rejection with its message", async () => {
    const user = userEvent.setup();
    const command = vi.fn().mockRejectedValue(new ManagementHttpError("No video is playing. (VIDEO_QUEUE_COMMAND_REJECTED, err-7)", "VIDEO_QUEUE_COMMAND_REJECTED", "err-7", null, [], [], 409));
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(playingVideo(), { command })} />);
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No video is playing.");
    expect(within(alert).getByRole("link", { name: "Open diagnostics" })).toHaveAttribute("href", "/manage/diagnostics?reference=err-7");
  });

  it("adds a video and shows a rejection next to the link", async () => {
    const user = userEvent.setup();
    const submit = vi.fn()
      .mockRejectedValueOnce(new ManagementHttpError("That site is not allowed. Add direct-file hosts in Videos settings. (VIDEO_REQUEST_REJECTED)", "VIDEO_REQUEST_REJECTED", null, null, [], [], 422))
      .mockResolvedValue({ ...queuedVideos().items[0]!, status: "held", holdReason: "over-limit" });
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(queuedVideos(), { submit })} />);
    const link = await screen.findByLabelText("Video link");
    await user.type(link, "https://unknown.example.com/video.mp4");
    await user.click(screen.getByRole("button", { name: "Add video" }));
    expect(link).toHaveAccessibleDescription("That site is not allowed. Add direct-file hosts in Videos settings.");
    expect(link).toHaveValue("https://unknown.example.com/video.mp4");
    await user.clear(link);
    await user.type(link, "https://youtu.be/abc");
    await user.type(screen.getByLabelText("Title (optional)"), "Viewer pick");
    await user.click(screen.getByRole("button", { name: "Add video" }));
    expect(submit).toHaveBeenLastCalledWith("live", { link: "https://youtu.be/abc", title: "Viewer pick" });
    expect(await screen.findByText("Video added and held: it is over the length limit.")).toBeVisible();
    expect(link).toHaveValue("");
  });

  it("switches to the test queue", async () => {
    const user = userEvent.setup();
    const getQueue = vi.fn(async (purpose: "live" | "test") => videoQueue({ purpose }));
    renderManagement(<VideoQueuePanel api={createStaticVideoQueueApi(videoQueue(), { getQueue })} />);
    await screen.findByText("Nothing is playing.");
    await user.click(screen.getByRole("button", { name: "Test queue" }));
    expect(screen.getByRole("button", { name: "Test queue" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(getQueue).toHaveBeenLastCalledWith("test"));
  });
});
