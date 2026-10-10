import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type NormalizedStreamEvent, type VideoRequestItem, type VideosModuleConfig } from "@stream-jams/core";
import { externalBusEvent } from "../../test-support/bus-event-fixtures.js";
import { createChannelPointVideoIntake } from "./channel-point-video-intake.js";
import { createStreamerBotVideoIntake, type VideoIntakeDiagnostic } from "./streamerbot-video-intake.js";
import { VideoRequestIntake } from "./video-request-intake.js";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteVideoQueueRepository, VideoQueueConflictError } from "./video-queue-repository.js";
import { VideoQueueCommandError, VideoQueueService, type VideoSubmission } from "./video-queue-service.js";

function setup(overrides: Partial<VideosModuleConfig> = {}, options: { enabled?: boolean; full?: boolean; onQueued?: (purpose: string, item: VideoRequestItem) => void } = {}) {
  const submissions: VideoSubmission[] = [];
  const config: VideosModuleConfig = { ...createDefaultVideosModuleConfig(), ...overrides };
  const queue: Pick<VideoQueueService, "submit" | "recentItem" | "requeue"> = {
    recentItem: () => { throw new VideoQueueCommandError("not-found", "missing"); },
    requeue: () => { throw new VideoQueueCommandError("not-found", "missing"); },
    submit: (purpose, submission) => {
      if (options.full === true) throw new VideoQueueCommandError("queue-full", "full");
      submissions.push(submission);
      return {
        id: `id${submissions.length}`, purpose, source: submission.source, title: submission.title, providerTitle: null, channelName: null, requester: submission.requester,
        submittedVia: submission.via, durationMs: submission.durationMs, status: "queued", holdReason: null, limitOverridden: false,
        autoplay: submission.autoplay, position: submissions.length, createdAt: new Date(0).toISOString()
      } satisfies VideoRequestItem;
    }
  };
  const intake = new VideoRequestIntake({ queue, getConfig: () => config, isModuleEnabled: () => options.enabled ?? true, onQueued: options.onQueued });
  return { intake, submissions, config };
}

const youtube = "https://youtu.be/dQw4w9WgXcQ?t=1m5s";

describe("VideoRequestIntake", () => {
  it("normalizes a link and queues it without autoplay by default", async () => {
    const { intake, submissions } = setup();
    const result = await intake.submit("live", { link: youtube, title: "Song", requester: "Viewer", durationSeconds: 12.2 }, { via: "management", mayAutoplay: true });
    expect(result).toMatchObject({ status: "accepted", item: { status: "queued", autoplay: false } });
    expect(submissions[0]).toMatchObject({ source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 65_000 }, durationMs: 12_200, via: "management" });
  });

  it("announces each accepted request once for a provider lookup, after the queue accepted it, and never a rejected one", async () => {
    const announced: string[] = [];
    const { intake } = setup({}, { onQueued: (purpose, item) => announced.push(`${purpose}:${item.id}`) });
    const accepted = await intake.submit("test", { link: youtube }, { via: "streamerbot", mayAutoplay: false });
    await intake.submit("test", { link: "not a link" }, { via: "streamerbot", mayAutoplay: false });
    await intake.submit("test", { title: "no link" }, { via: "streamerbot", mayAutoplay: false });
    expect(accepted.status).toBe("accepted");
    expect(announced).toEqual(["test:id1"]);

    const full: string[] = [];
    const rejected = setup({}, { full: true, onQueued: (_purpose, item) => full.push(item.id) });
    expect(await rejected.intake.submit("live", { link: youtube }, { via: "automation", mayAutoplay: false })).toMatchObject({ status: "rejected", reason: "queue-full" });
    const disabled = setup({}, { enabled: false, onQueued: (_purpose, item) => full.push(item.id) });
    expect(await disabled.intake.submit("live", { link: youtube }, { via: "automation", mayAutoplay: false })).toMatchObject({ status: "rejected", reason: "module-disabled" });
    expect(full).toEqual([]);
  });

  it("honors autoplay only when the caller and channel allow it", async () => {
    const autoplay = async (via: VideoSubmission["via"], mayAutoplay: boolean, overrides: Partial<VideosModuleConfig> = {}) => {
      const { intake } = setup(overrides);
      const result = await intake.submit("live", { link: youtube, autoplay: true }, { via, mayAutoplay });
      return result.status === "accepted" && result.item.autoplay;
    };
    expect(await autoplay("automation", true)).toBe(true);
    expect(await autoplay("automation", false)).toBe(false);
    expect(await autoplay("channel-points", true)).toBe(false);
    expect(await autoplay("streamerbot", true)).toBe(true);
    expect(await autoplay("streamerbot", true, { streamerBotAutoplay: false })).toBe(false);
  });

  it("rejects bad input with field names only, never the submitted values", async () => {
    const { intake, submissions } = setup();
    const secret = "https://evil.example/secret-token.mp4";
    const results = [
      await intake.submit("live", { link: youtube, extra: secret }, { via: "automation", mayAutoplay: false }),
      await intake.submit("live", { title: "x" }, { via: "automation", mayAutoplay: false }),
      await intake.submit("live", { link: "not a link" }, { via: "automation", mayAutoplay: false }),
      await intake.submit("live", { link: "http://youtu.be/dQw4w9WgXcQ" }, { via: "automation", mayAutoplay: false }),
      await intake.submit("live", { link: secret }, { via: "automation", mayAutoplay: false })
    ];
    expect(results).toEqual([
      { status: "rejected", reason: "invalid-request", fields: ["request"] },
      { status: "rejected", reason: "invalid-request", fields: ["link"] },
      { status: "rejected", reason: "invalid-link", fields: ["link"] },
      { status: "rejected", reason: "unsafe-link", fields: ["link"] },
      { status: "rejected", reason: "unsupported-source", fields: ["link"] }
    ]);
    expect(JSON.stringify(results)).not.toContain("secret");
    expect(submissions).toHaveLength(0);
  });

  it("accepts direct files only from allowed hosts", async () => {
    const { intake } = setup({ allowedDirectHosts: ["cdn.example.com"] });
    expect((await intake.submit("live", { link: "https://cdn.example.com/a.mp4" }, { via: "operator", mayAutoplay: true })).status).toBe("accepted");
    expect(await intake.submit("live", { link: "https://cdn.example.com/a.mov" }, { via: "operator", mayAutoplay: true })).toMatchObject({ reason: "unsupported-source" });
  });

  it("rejects requests while the module is off or the queue is full", async () => {
    expect(await setup({}, { enabled: false }).intake.submit("live", { link: youtube }, { via: "management", mayAutoplay: true })).toMatchObject({ reason: "module-disabled" });
    expect(await setup({}, { full: true }).intake.submit("live", { link: youtube }, { via: "management", mayAutoplay: true })).toMatchObject({ reason: "queue-full" });
  });
});

function envelope(payload: Record<string, unknown> | undefined, sourceKey = "General", eventType = "Custom") {
  const eventId = "sb-video";
  return { ...externalBusEvent([{ kind: "streamerbot-event", eventId, occurredAt: "2026-10-07T00:00:00.000Z", providerId: "provider-streamerbot", sourceKey, eventType, summary: "Custom", userName: "" }]), ...(payload === undefined ? {} : { payload }) };
}

function streamerBotSetup(overrides: Partial<VideosModuleConfig> = {}, options: { enabled?: boolean } = {}) {
  const base = setup(overrides, options);
  const diagnostics: VideoIntakeDiagnostic[] = [];
  const commands: unknown[] = [];
  const notices: (string | null)[] = [];
  let current = false;
  const handle = createStreamerBotVideoIntake({
    intake: base.intake,
    queue: {
      view: () => ({ revision: 7, current: current ? {} : null, gapEndsAtEpochMs: null }) as unknown as ReturnType<VideoQueueService["view"]>,
      command: (_purpose, revision, command) => { commands.push({ revision, command }); return undefined as unknown as ReturnType<VideoQueueService["command"]>; },
      showNotice: (_purpose, name) => { notices.push(name); }
    },
    onDiagnostic: entry => { diagnostics.push(entry); }
  });
  return { ...base, handle, diagnostics, commands, notices, setPlaying: (value: boolean) => { current = value; } };
}

describe("Streamer.bot video intake", () => {
  it("ignores events without a Videos marker", async () => {
    const { handle, submissions } = streamerBotSetup();
    expect(await handle(envelope({ source: "StreamJams", type: "Other", link: youtube }))).toBe("no-match");
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: youtube }, "Twitch", "Follow"))).toBe("no-match");
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: youtube }, "General", "Other"))).toBe("no-match");
    expect(await handle(envelope({ source: "SomethingElse", type: "VideoShoutout", clipId: "ClipOne" }))).toBe("no-match");
    expect(await handle(envelope(undefined))).toBe("no-match");
    expect(submissions).toHaveLength(0);
  });

  it("queues VideoRequest payloads and honors explicit autoplay", async () => {
    const { handle, submissions, diagnostics } = streamerBotSetup();
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", purpose: "test", link: youtube, requester: "Mod", autoplay: true }))).toBe("admitted");
    expect(submissions[0]).toMatchObject({ via: "streamerbot", requester: "Mod", autoplay: true });
    expect(diagnostics[0]?.metadata).toMatchObject({ purpose: "test", legacy: false, autoplay: true });
    expect(JSON.stringify(diagnostics)).not.toContain("dQw4w9WgXcQ");
  });

  it("maps legacy VideoShoutout payloads to a queued Twitch clip", async () => {
    const { handle, submissions } = streamerBotSetup();
    await handle(envelope({ source: "StreamJams", type: "VideoShoutout", clipId: "FunnyClip-abc", displayName: "Friend", duration: "29.5" }));
    expect(submissions[0]).toMatchObject({ source: { provider: "twitch-clip", clipSlug: "FunnyClip-abc" }, requester: "Friend", durationMs: 29_500, autoplay: false });
  });

  it("matches the General source case-insensitively", async () => {
    const { handle, submissions } = streamerBotSetup();
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: youtube }, "general"))).toBe("admitted");
    expect(submissions).toHaveLength(1);
  });

  it("reports rejections by reason and field without values", async () => {
    const { handle, diagnostics, submissions } = streamerBotSetup();
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: "https://evil.example/private.mp4" }))).toBe("failed");
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", purpose: "staging", link: youtube }))).toBe("failed");
    expect(submissions).toHaveLength(0);
    expect(diagnostics.map(entry => entry.metadata.reason)).toEqual(["unsupported-source", "invalid-request"]);
    expect(JSON.stringify(diagnostics)).not.toContain("private");
  });

  it("reports requests the disabled module turned away as matching nothing", async () => {
    const { handle, diagnostics, submissions } = streamerBotSetup({}, { enabled: false });
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: youtube }))).toBe("no-match");
    expect(submissions).toHaveLength(0);
    expect(diagnostics[0]).toMatchObject({ level: "warn", metadata: { reason: "module-disabled" } });
  });

  it("stops current playback on clear and shows the no-clip notice", async () => {
    const { handle, commands, notices, setPlaying } = streamerBotSetup();
    await handle(envelope({ source: "StreamJams", type: "VideoRequest", action: "clear" }));
    expect(commands).toHaveLength(0);
    setPlaying(true);
    await handle(envelope({ source: "StreamJams", type: "VideoRequest", action: "clear" }));
    expect(commands).toEqual([{ revision: 7, command: { kind: "stop" } }]);
    await handle(envelope({ source: "StreamJams", type: "VideoShoutout", action: "no-clip", displayName: "Friend" }));
    expect(notices).toEqual(["Friend"]);
  });
});

describe("channel point video intake", () => {
  const redemption = (rewardId: string, userInput: string | undefined): NormalizedStreamEvent => ({
    id: "event-1", type: "channel_point_redemption", rewardId, rewardTitle: "Play a video", userInput,
    actor: { displayName: "Viewer" }
  }) as unknown as NormalizedStreamEvent;

  it("queues mapped rewards without autoplay and ignores others", async () => {
    const base = setup({ rewardMappings: [{ rewardId: "reward-1", purpose: "live" }] });
    const diagnostics: VideoIntakeDiagnostic[] = [];
    const handler = createChannelPointVideoIntake({ intake: base.intake, getConfig: () => base.config, onDiagnostic: entry => { diagnostics.push(entry); } });
    expect(await handler.handleEvent(redemption("reward-2", youtube))).toBe("no-match");
    expect(await handler.handleEvent({ ...redemption("reward-1", youtube), type: "follow" } as NormalizedStreamEvent)).toBe("no-match");
    expect(base.submissions).toHaveLength(0);
    expect(await handler.handleEvent(redemption("reward-1", ` ${youtube} `))).toBe("admitted");
    expect(base.submissions[0]).toMatchObject({ via: "channel-points", requester: "Viewer", autoplay: false });
    expect(await handler.handleEvent(redemption("reward-1", "   "))).toBe("failed");
    expect(diagnostics.at(-1)).toMatchObject({ level: "warn", metadata: { reason: "invalid-request", fields: ["link"] } });
  });
});

describe("VideoRequestIntake replay", () => {
  const databases: StreamJamsDatabase[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  function setupReplay() {
    const database = createInMemoryStreamJamsDatabase();
    database.runMigrations();
    databases.push(database);
    let config: VideosModuleConfig = { ...createDefaultVideosModuleConfig(), allowedDirectHosts: ["videos.example.com"] };
    let enabled = true;
    let tick = 0;
    const queue = new VideoQueueService({
      repository: new SqliteVideoQueueRepository(database.connection, () => new Date(1_000 + tick++).toISOString()),
      getConfig: () => config,
      scheduler: { setTimeout: () => null, clearTimeout: () => {} }
    });
    const queued: string[] = [];
    const intake = new VideoRequestIntake({ queue, getConfig: () => config, isModuleEnabled: () => enabled, onQueued: (purpose, item) => queued.push(`${purpose}:${item.id}`) });
    async function finished(link: string) {
      const result = await intake.submit("live", { link, title: "Replay me" }, { via: "streamerbot", mayAutoplay: true });
      if (result.status !== "accepted") throw new Error("not accepted");
      queue.command("live", queue.view("live").revision, { kind: "play-next" });
      queue.reportEnded(result.item.id);
      return result.item;
    }
    return { queue, intake, finished, queued, setConfig: (next: Partial<VideosModuleConfig>) => { config = { ...config, ...next }; }, setEnabled: (value: boolean) => { enabled = value; } };
  }

  it("queues a Recent item again under the replaying surface", async () => {
    const { queue, intake, finished, queued } = setupReplay();
    const played = await finished(youtube);
    const result = await intake.requeue("live", queue.view("live").revision, played.id, "operator");
    // The replay is announced for a provider lookup like any new request.
    expect(queued).toEqual([`live:${played.id}`, `live:${result.status === "accepted" ? result.item.id : ""}`]);
    expect(result).toMatchObject({ status: "accepted", item: { source: played.source, title: "Replay me", submittedVia: "operator", autoplay: false, status: "queued" } });
    expect(queue.view("live").items).toHaveLength(1);
    expect(queue.view("live").current).toBeNull();
  });

  it("rejects replay while the module is off or once the link is no longer allowed", async () => {
    const { queue, intake, finished, setConfig, setEnabled } = setupReplay();
    const direct = await finished("https://videos.example.com/clip.mp4");
    setEnabled(false);
    expect(await intake.requeue("live", queue.view("live").revision, direct.id, "operator")).toEqual({ status: "rejected", reason: "module-disabled" });
    setEnabled(true);
    setConfig({ allowedDirectHosts: [] });
    expect(await intake.requeue("live", queue.view("live").revision, direct.id, "operator")).toEqual({ status: "rejected", reason: "unsupported-source" });
    expect(queue.view("live").items).toEqual([]);
  });

  it("passes stale revisions and missing items through as queue errors", async () => {
    const { queue, intake, finished } = setupReplay();
    const played = await finished(youtube);
    await expect(intake.requeue("live", queue.view("live").revision + 1, played.id, "operator")).rejects.toBeInstanceOf(VideoQueueConflictError);
    await expect(intake.requeue("live", queue.view("live").revision, "video:missing", "operator")).rejects.toBeInstanceOf(VideoQueueCommandError);
    expect(queue.view("live").items).toEqual([]);
  });
});
