import type { BusEvent, NormalizedStreamEvent, VideoShoutoutCommand } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createVideoShoutoutBusConsumer, videoShoutoutExternalIdentity, type VideoShoutoutIntakeDiagnostic } from "./video-shoutout-bus-consumer.js";

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

let sequence = 0;

function external(sourceKey: string, eventType: string, payload?: Record<string, unknown>): BusEvent {
  sequence += 1;
  const eventId = `sb-${sequence}`;
  return {
    kind: "external",
    sequence,
    busId: `bus-${sequence}`,
    eventId,
    sourceKind: "streamerbot",
    sourceRegistrationId: "provider-streamerbot",
    receivedAt: "2026-10-07T00:00:00.000Z",
    correlationKey: null,
    effectTriggers: [{ kind: "streamerbot-event", eventId, occurredAt: "2026-10-07T00:00:00.000Z", providerId: "provider-streamerbot", sourceKey, eventType, summary: "Custom", userName: "" }],
    ...(payload === undefined ? {} : { payload })
  };
}

function canonical(): BusEvent {
  sequence += 1;
  const event: NormalizedStreamEvent = {
    id: `follow-${sequence}`, type: "follow", amount: null, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch",
    occurredAt: "2026-10-07T00:00:00.000Z", actor: { id: "friend", displayName: "Friend" }, message: null, metadata: {}
  };
  return {
    kind: "canonical", event, sequence, busId: `bus-${sequence}`, eventId: event.id, sourceKind: "twitch",
    sourceRegistrationId: "provider-twitch", receivedAt: event.occurredAt, correlationKey: null, effectTriggers: []
  };
}

function createIntake(enabled = true) {
  const commands: VideoShoutoutCommand[] = [];
  const diagnostics: VideoShoutoutIntakeDiagnostic[] = [];
  const consumer = createVideoShoutoutBusConsumer({
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
  return { intake: (event: BusEvent) => consumer.handle(event, { checkpoint: () => {} }), consumer, commands, diagnostics };
}

describe("Video shoutout bus consumer", () => {
  it("registers for the General/Custom payload with one delivery attempt", () => {
    const { consumer } = createIntake();
    expect(consumer).toMatchObject({ id: "video-shoutout", maxAttempts: 1, externalPayloads: [videoShoutoutExternalIdentity] });
    expect(videoShoutoutExternalIdentity).toEqual({ providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" });
  });

  it("routes a marked General/Custom broadcast to the module and logs only bounded identifiers", async () => {
    const { intake, commands, diagnostics } = createIntake();
    await intake(external("General", "Custom", data));
    expect(commands).toEqual([{ kind: "play", purpose: "live", avatarOmitted: false, clip: expect.objectContaining({ clipId: "ClipOne", durationMs: 12_000 }) }]);
    expect(diagnostics).toEqual([{
      level: "info",
      message: "Streamer.bot video shoutout was accepted.",
      metadata: { action: "play", purpose: "live", activationId: "video-shoutout:a", login: "friendly_streamer", clipId: "ClipOne", durationMs: 12_000, avatarOmitted: false }
    }]);
    expect(JSON.stringify(diagnostics)).not.toContain("clips.twitch.tv");
  });

  it("ignores other events so stream events and unrelated broadcasts never trigger shoutouts", async () => {
    const { intake, commands, diagnostics } = createIntake();
    await intake(canonical());
    for (const [source, type, payload] of [
      ["Twitch", "Follow", { user_name: "friend" }],
      ["Twitch", "Raid", { ...data }],
      ["Twitch", "RewardRedemption", { ...data }],
      ["General", "Other", { ...data }],
      ["General", "Custom", { source: "SomethingElse", type: "VideoShoutout" }],
      ["General", "Custom", { message: "unrelated custom broadcast" }],
      ["General", "Custom", undefined]
    ] as const) {
      await intake(external(source, type, payload));
    }
    expect(commands).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("matches the General source case-insensitively, as before the bus", async () => {
    const { intake, commands } = createIntake();
    await intake(external("general", "Custom", data));
    expect(commands).toHaveLength(1);
  });

  it("applies each journal row at most once", async () => {
    const { intake, commands } = createIntake();
    const event = external("General", "Custom", data);
    await intake(event);
    await intake(event);
    expect(commands).toHaveLength(1);
  });

  it("consumes invalid shoutouts without applying them or logging their values", async () => {
    const { intake, commands, diagnostics } = createIntake();
    await intake(external("General", "Custom", { ...data, embedUrl: "https://evil.example/embed?clip=ClipOne&parent=x" }));
    await intake(external("General", "Custom", { ...data, title: undefined }));
    expect(commands).toEqual([]);
    expect(diagnostics).toEqual([
      { level: "warn", message: "Streamer.bot video shoutout was rejected and not shown.", metadata: { reason: "unsafe-embed-url", fields: ["embedUrl"] } },
      { level: "warn", message: "Streamer.bot video shoutout was rejected and not shown.", metadata: { reason: "invalid-payload", fields: ["title"] } }
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("evil.example");
  });

  it("routes explicit clear and no-clip triggers", async () => {
    const { intake, commands } = createIntake();
    await intake(external("General", "Custom", { source: "StreamJams", type: "VideoShoutout", action: "no-clip", displayName: "Quiet Friend" }));
    await intake(external("General", "Custom", { source: "StreamJams", type: "VideoShoutout", action: "clear" }));
    expect(commands).toEqual([
      { kind: "no-clip", purpose: "live", displayName: "Quiet Friend" },
      { kind: "clear", purpose: "live" }
    ]);
  });

  it("ignores valid shoutouts while the module is disabled", async () => {
    const { intake, commands, diagnostics } = createIntake(false);
    await intake(external("General", "Custom", data));
    expect(commands).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ level: "info", metadata: { action: "play", purpose: "live" } });
  });
});
