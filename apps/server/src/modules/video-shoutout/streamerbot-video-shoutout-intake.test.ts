import type { VideoShoutoutCommand } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";
import { createStreamerBotVideoShoutoutIntake, type VideoShoutoutIntakeDiagnostic } from "./streamerbot-video-shoutout-intake.js";

const embedUrl = "https://clips.twitch.tv/embed?clip=ClipOne&parent=127.0.0.1&secret-looking=abc";
const data = {
  source: "StreamJams",
  type: "VideoShoutout",
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "ClipOne",
  embedUrl,
  title: "The big play",
  duration: 12
};

function envelope(source: string, type: string, payload: Record<string, unknown>): StreamerBotEventEnvelope {
  return { timeStamp: "2026-10-07T00:00:00.000Z", event: { source, type }, data: payload };
}

function createIntake(enabled = true) {
  const commands: VideoShoutoutCommand[] = [];
  const diagnostics: VideoShoutoutIntakeDiagnostic[] = [];
  const intake = createStreamerBotVideoShoutoutIntake({
    service: {
      apply(command) {
        commands.push(command);
        return command.kind === "clear" ? { status: "idle" } : command.kind === "no-clip"
          ? { status: "error", activationId: "video-shoutout:a", reason: "no-clip", displayName: command.displayName }
          : { status: "loading", activationId: "video-shoutout:a", clip: command.clip };
      }
    },
    isModuleEnabled: async () => enabled,
    onDiagnostic: entry => { diagnostics.push(entry); }
  });
  return { intake, commands, diagnostics };
}

describe("Streamer.bot video shoutout intake", () => {
  it("routes a marked General/Custom broadcast to the module and logs only bounded identifiers", async () => {
    const { intake, commands, diagnostics } = createIntake();
    await expect(intake(envelope("General", "Custom", data))).resolves.toBe(true);
    expect(commands).toEqual([{ kind: "play", purpose: "live", avatarOmitted: false, clip: expect.objectContaining({ clipId: "ClipOne", durationMs: 12_000 }) }]);
    expect(diagnostics).toEqual([{
      level: "info",
      message: "Streamer.bot video shoutout was accepted.",
      metadata: { action: "play", purpose: "live", activationId: "video-shoutout:a", login: "friendly_streamer", clipId: "ClipOne", durationMs: 12_000, avatarOmitted: false }
    }]);
    expect(JSON.stringify(diagnostics)).not.toContain("clips.twitch.tv");
  });

  it("leaves other events to normal ingestion so stream events never trigger shoutouts", async () => {
    const { intake, commands } = createIntake();
    for (const [source, type, payload] of [
      ["Twitch", "Follow", { user_name: "friend" }],
      ["Twitch", "Raid", { ...data }],
      ["Twitch", "RewardRedemption", { ...data }],
      ["General", "Custom", { source: "SomethingElse", type: "VideoShoutout" }],
      ["General", "Custom", { message: "unrelated custom broadcast" }]
    ] as const) {
      await expect(intake(envelope(source, type, payload))).resolves.toBe(false);
    }
    expect(commands).toEqual([]);
  });

  it("consumes invalid shoutouts without applying them or logging their values", async () => {
    const { intake, commands, diagnostics } = createIntake();
    await expect(intake(envelope("General", "Custom", { ...data, embedUrl: "https://evil.example/embed?clip=ClipOne&parent=x" }))).resolves.toBe(true);
    await expect(intake(envelope("General", "Custom", { ...data, title: undefined }))).resolves.toBe(true);
    expect(commands).toEqual([]);
    expect(diagnostics).toEqual([
      { level: "warn", message: "Streamer.bot video shoutout was rejected and not shown.", metadata: { reason: "unsafe-embed-url", fields: ["embedUrl"] } },
      { level: "warn", message: "Streamer.bot video shoutout was rejected and not shown.", metadata: { reason: "invalid-payload", fields: ["title"] } }
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("evil.example");
  });

  it("routes explicit clear and no-clip triggers", async () => {
    const { intake, commands } = createIntake();
    await intake(envelope("General", "Custom", { source: "StreamJams", type: "VideoShoutout", action: "no-clip", displayName: "Quiet Friend" }));
    await intake(envelope("General", "Custom", { source: "StreamJams", type: "VideoShoutout", action: "clear" }));
    expect(commands).toEqual([
      { kind: "no-clip", purpose: "live", displayName: "Quiet Friend" },
      { kind: "clear", purpose: "live" }
    ]);
  });

  it("ignores valid shoutouts while the module is disabled", async () => {
    const { intake, commands, diagnostics } = createIntake(false);
    await expect(intake(envelope("General", "Custom", data))).resolves.toBe(true);
    expect(commands).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ level: "info", metadata: { action: "play", purpose: "live" } });
  });
});
