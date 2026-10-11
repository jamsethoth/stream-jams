import { describe, expect, it } from "vitest";
import type { ProviderRegistrationRecord } from "../modules/providers/sqlite-provider-registration-repository.js";
import { syncEventSourceRuntimes } from "./event-source-runtime-coordinator.js";

describe("syncEventSourceRuntimes", () => {
  it.each([
    ["only direct Twitch", ["twitch"], ["twitch:connect", "streamerbot:sync"]],
    ["only Streamer.bot", ["streamerbot"], ["twitch:disconnect", "streamerbot:sync"]],
    ["both sources", ["twitch", "streamerbot"], ["twitch:connect", "streamerbot:sync"]],
    ["no source", [], ["twitch:disconnect", "streamerbot:sync"]]
  ] as const)("syncs each runtime from its own registration with %s active", async (_label, active, expected) => {
    const operations: string[] = [];
    await syncEventSourceRuntimes(runtimes(active, operations));
    expect(operations.sort()).toEqual([...expected].sort());
  });

  it.each([
    ["streamerbot", ["streamerbot:sync"]],
    ["twitch", ["twitch:connect"]]
  ] as const)("leaves the other runtime running when only %s changed", async (kind, expected) => {
    const operations: string[] = [];
    await syncEventSourceRuntimes({ ...runtimes(["twitch", "streamerbot"], operations), kinds: [kind] });
    expect(operations).toEqual(expected);
  });

  it("still syncs Streamer.bot when direct Twitch fails to connect, then reports the failure", async () => {
    const operations: string[] = [];
    const options = runtimes(["twitch", "streamerbot"], operations);
    await expect(syncEventSourceRuntimes({
      ...options,
      twitchRuntime: { ...options.twitchRuntime, connectStoredAccount: async () => { throw new Error("token expired"); } }
    })).rejects.toThrow("token expired");
    expect(operations).toEqual(["streamerbot:sync"]);
  });
});

function runtimes(active: readonly ("twitch" | "streamerbot")[], operations: string[]) {
  return {
    repository: { findActiveByKind: async (kind: string) => active.includes(kind as "twitch") ? registration(kind as "twitch") : null },
    twitchRuntime: {
      connectStoredAccount: async () => { operations.push("twitch:connect"); },
      disconnect: () => { operations.push("twitch:disconnect"); }
    },
    streamerBotRuntime: {
      syncActiveRegistration: async () => { operations.push("streamerbot:sync"); }
    }
  };
}

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
