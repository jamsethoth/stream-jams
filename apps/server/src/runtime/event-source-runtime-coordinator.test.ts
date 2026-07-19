import { describe, expect, it } from "vitest";
import type { ProviderRegistrationRecord } from "../modules/providers/sqlite-provider-registration-repository.js";
import { syncEventSourceRuntimes } from "./event-source-runtime-coordinator.js";

describe("syncEventSourceRuntimes", () => {
  it("disconnects Streamer.bot before connecting active Twitch", async () => {
    const operations: string[] = [];
    await syncEventSourceRuntimes({
      repository: { findActive: async () => registration("twitch") },
      twitchRuntime: {
        connectStoredAccount: async () => { operations.push("twitch:connect"); },
        disconnect: () => { operations.push("twitch:disconnect"); }
      },
      streamerBotRuntime: {
        syncActiveRegistration: async () => { operations.push("streamerbot:connect"); },
        disconnect: () => { operations.push("streamerbot:disconnect"); }
      }
    });

    expect(operations).toEqual(["streamerbot:disconnect", "twitch:connect"]);
  });

  it("disconnects Twitch before connecting active Streamer.bot", async () => {
    const operations: string[] = [];
    await syncEventSourceRuntimes({
      repository: { findActive: async () => registration("streamerbot") },
      twitchRuntime: {
        connectStoredAccount: async () => { operations.push("twitch:connect"); },
        disconnect: () => { operations.push("twitch:disconnect"); }
      },
      streamerBotRuntime: {
        syncActiveRegistration: async () => { operations.push("streamerbot:connect"); },
        disconnect: () => { operations.push("streamerbot:disconnect"); }
      }
    });

    expect(operations).toEqual(["twitch:disconnect", "streamerbot:connect"]);
  });

  it("disconnects both runtimes when no event source is active", async () => {
    const operations: string[] = [];
    await syncEventSourceRuntimes({
      repository: { findActive: async () => null },
      twitchRuntime: {
        connectStoredAccount: async () => { operations.push("twitch:connect"); },
        disconnect: () => { operations.push("twitch:disconnect"); }
      },
      streamerBotRuntime: {
        syncActiveRegistration: async () => { operations.push("streamerbot:connect"); },
        disconnect: () => { operations.push("streamerbot:disconnect"); }
      }
    });

    expect(operations).toEqual(["twitch:disconnect", "streamerbot:disconnect"]);
  });
});

function registration(kind: "twitch" | "streamerbot"): ProviderRegistrationRecord {
  return {
    provider: {
      id: `provider-${kind}`,
      name: kind,
      kind,
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      validatedAt: "2026-07-17T12:00:00.000Z",
      error: null,
      usedByAlertCount: 0
    },
    configuration: {},
    availableVoices: [],
    secretRef: null,
    ttsSafety: null,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z"
  };
}
