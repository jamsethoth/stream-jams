import { describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type NormalizedStreamEvent, type VideoRequestItem, type VideosModuleConfig } from "@stream-jams/core";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";
import { createChannelPointVideoIntake } from "./channel-point-video-intake.js";
import { createStreamerBotVideoIntake, type VideoIntakeDiagnostic } from "./streamerbot-video-intake.js";
import { VideoRequestIntake } from "./video-request-intake.js";
import { VideoQueueCommandError, type VideoQueueService, type VideoSubmission } from "./video-queue-service.js";

function setup(overrides: Partial<VideosModuleConfig> = {}, options: { enabled?: boolean; full?: boolean } = {}) {
  const submissions: VideoSubmission[] = [];
  const config: VideosModuleConfig = { ...createDefaultVideosModuleConfig(), ...overrides };
  const queue: Pick<VideoQueueService, "submit"> = {
    submit: (purpose, submission) => {
      if (options.full === true) throw new VideoQueueCommandError("queue-full", "full");
      submissions.push(submission);
      return {
        id: `id${submissions.length}`, purpose, source: submission.source, title: submission.title, requester: submission.requester,
        submittedVia: submission.via, durationMs: submission.durationMs, status: "queued", holdReason: null, limitOverridden: false,
        autoplay: submission.autoplay, position: submissions.length, createdAt: new Date(0).toISOString()
      } satisfies VideoRequestItem;
    }
  };
  const intake = new VideoRequestIntake({ queue, getConfig: () => config, isModuleEnabled: () => options.enabled ?? true });
  return { intake, submissions, config };
}

const youtube = "https://youtu.be/dQw4w9WgXcQ?t=1m5s";

describe("VideoRequestIntake", () => {
  it("normalizes a link and queues it without autoplay by default", () => {
    const { intake, submissions } = setup();
    const result = intake.submit("live", { link: youtube, title: "Song", requester: "Viewer", durationSeconds: 12.2 }, { via: "management", mayAutoplay: true });
    expect(result).toMatchObject({ status: "accepted", item: { status: "queued", autoplay: false } });
    expect(submissions[0]).toMatchObject({ source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 65_000 }, durationMs: 12_200, via: "management" });
  });

  it("honors autoplay only when the caller and channel allow it", () => {
    const autoplay = (via: VideoSubmission["via"], mayAutoplay: boolean, overrides: Partial<VideosModuleConfig> = {}) => {
      const { intake } = setup(overrides);
      const result = intake.submit("live", { link: youtube, autoplay: true }, { via, mayAutoplay });
      return result.status === "accepted" && result.item.autoplay;
    };
    expect(autoplay("automation", true)).toBe(true);
    expect(autoplay("automation", false)).toBe(false);
    expect(autoplay("channel-points", true)).toBe(false);
    expect(autoplay("streamerbot", true)).toBe(true);
    expect(autoplay("streamerbot", true, { streamerBotAutoplay: false })).toBe(false);
  });

  it("rejects bad input with field names only, never the submitted values", () => {
    const { intake, submissions } = setup();
    const secret = "https://evil.example/secret-token.mp4";
    const results = [
      intake.submit("live", { link: youtube, extra: secret }, { via: "automation", mayAutoplay: false }),
      intake.submit("live", { title: "x" }, { via: "automation", mayAutoplay: false }),
      intake.submit("live", { link: "not a link" }, { via: "automation", mayAutoplay: false }),
      intake.submit("live", { link: "http://youtu.be/dQw4w9WgXcQ" }, { via: "automation", mayAutoplay: false }),
      intake.submit("live", { link: secret }, { via: "automation", mayAutoplay: false })
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

  it("accepts direct files only from allowed hosts", () => {
    const { intake } = setup({ allowedDirectHosts: ["cdn.example.com"] });
    expect(intake.submit("live", { link: "https://cdn.example.com/a.mp4" }, { via: "operator", mayAutoplay: true }).status).toBe("accepted");
    expect(intake.submit("live", { link: "https://cdn.example.com/a.mov" }, { via: "operator", mayAutoplay: true })).toMatchObject({ reason: "unsupported-source" });
  });

  it("rejects requests while the module is off or the queue is full", () => {
    expect(setup({}, { enabled: false }).intake.submit("live", { link: youtube }, { via: "management", mayAutoplay: true })).toMatchObject({ reason: "module-disabled" });
    expect(setup({}, { full: true }).intake.submit("live", { link: youtube }, { via: "management", mayAutoplay: true })).toMatchObject({ reason: "queue-full" });
  });
});

function envelope(data: unknown, source = "General", type = "Custom"): StreamerBotEventEnvelope {
  return { event: { source, type }, data } as StreamerBotEventEnvelope;
}

function streamerBotSetup(overrides: Partial<VideosModuleConfig> = {}) {
  const base = setup(overrides);
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
    expect(await handle(envelope({ source: "StreamJams", type: "Other", link: youtube }))).toBe(false);
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: youtube }, "Twitch", "Follow"))).toBe(false);
    expect(await handle(envelope("text"))).toBe(false);
    expect(submissions).toHaveLength(0);
  });

  it("queues VideoRequest payloads and honors explicit autoplay", async () => {
    const { handle, submissions, diagnostics } = streamerBotSetup();
    expect(await handle(envelope({ source: "StreamJams", type: "VideoRequest", purpose: "test", link: youtube, requester: "Mod", autoplay: true }))).toBe(true);
    expect(submissions[0]).toMatchObject({ via: "streamerbot", requester: "Mod", autoplay: true });
    expect(diagnostics[0]?.metadata).toMatchObject({ purpose: "test", legacy: false, autoplay: true });
    expect(JSON.stringify(diagnostics)).not.toContain("dQw4w9WgXcQ");
  });

  it("maps legacy VideoShoutout payloads to a queued Twitch clip", async () => {
    const { handle, submissions } = streamerBotSetup();
    await handle(envelope({ source: "StreamJams", type: "VideoShoutout", clipId: "FunnyClip-abc", displayName: "Friend", duration: "29.5" }));
    expect(submissions[0]).toMatchObject({ source: { provider: "twitch-clip", clipSlug: "FunnyClip-abc" }, requester: "Friend", durationMs: 29_500, autoplay: false });
  });

  it("reports rejections by reason and field without values", async () => {
    const { handle, diagnostics, submissions } = streamerBotSetup();
    await handle(envelope({ source: "StreamJams", type: "VideoRequest", link: "https://evil.example/private.mp4" }));
    await handle(envelope({ source: "StreamJams", type: "VideoRequest", purpose: "staging", link: youtube }));
    expect(submissions).toHaveLength(0);
    expect(diagnostics.map(entry => entry.metadata.reason)).toEqual(["unsupported-source", "invalid-request"]);
    expect(JSON.stringify(diagnostics)).not.toContain("private");
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
    await handler.handleEvent(redemption("reward-2", youtube));
    expect(base.submissions).toHaveLength(0);
    await handler.handleEvent(redemption("reward-1", ` ${youtube} `));
    expect(base.submissions[0]).toMatchObject({ via: "channel-points", requester: "Viewer", autoplay: false });
    await handler.handleEvent(redemption("reward-1", "   "));
    expect(diagnostics.at(-1)).toMatchObject({ level: "warn", metadata: { reason: "invalid-request", fields: ["link"] } });
  });
});
