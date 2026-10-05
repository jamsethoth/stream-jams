import type {
  OwnerOperationsSnapshot,
  PlaybackSafetyState,
  QueueOwner
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import {
  PlaybackOperationsConflictError,
  PlaybackOperationsService,
  UnknownPlaybackOwnerError
} from "./playback-operations-service.js";

function owner(moduleId: string, input: Partial<OwnerOperationsSnapshot> = {}): QueueOwner {
  let state: OwnerOperationsSnapshot = {
    moduleId,
    paused: input.paused ?? false,
    current: input.current ?? null,
    queued: input.queued ?? [],
    recent: input.recent ?? []
  };
  return {
    moduleId,
    snapshot: () => structuredClone(state),
    skip: vi.fn(async (occurrenceId: string) => state.current?.occurrenceId === occurrenceId),
    remove: vi.fn(async (occurrenceId: string) => state.queued.some((row) => row.occurrenceId === occurrenceId)),
    replay: vi.fn(async (occurrenceId: string) => state.recent.some((row) => row.occurrenceId === occurrenceId)),
    clearPending: vi.fn(async () => state.queued.length),
    setPaused: vi.fn(async (paused: boolean) => { state = { ...state, paused }; })
  };
}

function row(moduleId: string, occurrenceId: string, status: "queued" | "playing" | "completed" = "queued") {
  return {
    moduleId,
    occurrenceId,
    name: "Playback",
    summary: "Safe summary",
    status,
    enqueuedAtMs: 1_000,
    completedAtMs: status === "completed" ? 2_000 : null,
    sequence: 0,
    moduleQueuePosition: status === "queued" ? 1 : null
  } as const;
}

function service(input: {
  readonly owners?: readonly QueueOwner[];
  readonly persistSafety?: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
  readonly applySafety?: (state: PlaybackSafetyState) => Promise<void>;
  readonly onSafetyApplyFailure?: (error: unknown) => void | Promise<void>;
} = {}) {
  return new PlaybackOperationsService({
    owners: input.owners ?? [owner("alerts"), owner("screen-effects")],
    initialSafety: { paused: false, muted: false, doNotDisturb: false },
    persistSafety: input.persistSafety ?? (async (patch) => ({
      ...patch,
      paused: patch.paused ?? false,
      muted: patch.muted ?? false,
      doNotDisturb: patch.doNotDisturb ?? false
    })),
    applySafety: input.applySafety ?? (async () => {}),
    onSafetyApplyFailure: input.onSafetyApplyFailure
  });
}

describe("PlaybackOperationsService", () => {
  it("targets only the owner and exact current occurrence", async () => {
    const alerts = owner("alerts", { current: row("alerts", "same", "playing") });
    const effects = owner("screen-effects", { current: row("screen-effects", "same", "playing") });
    const operations = service({ owners: [alerts, effects] });

    await operations.skip("screen-effects", "same");

    expect(effects.skip).toHaveBeenCalledWith("same");
    expect(alerts.skip).not.toHaveBeenCalled();
    await expect(operations.skip("screen-effects", "replacement")).rejects.toBeInstanceOf(PlaybackOperationsConflictError);
  });

  it("rejects changed clear impact or revision before mutating", async () => {
    const effects = owner("screen-effects", { queued: [row("screen-effects", "one")] });
    const operations = service({ owners: [effects] });
    const observed = operations.getSnapshot();

    await expect(operations.clear("screen-effects", 2, observed.revision)).rejects.toBeInstanceOf(PlaybackOperationsConflictError);
    await expect(operations.clear("screen-effects", 1, observed.revision + 1)).rejects.toBeInstanceOf(PlaybackOperationsConflictError);
    expect(effects.clearPending).not.toHaveBeenCalled();

    await operations.clear("screen-effects", 1, observed.revision);
    expect(effects.clearPending).toHaveBeenCalledOnce();
  });

  it("persists global safety before applying it and stays unchanged on failure", async () => {
    const applySafety = vi.fn(async () => {});
    const persistSafety = vi.fn(async () => { throw new Error("config write failed"); });
    const operations = service({ persistSafety, applySafety });

    await expect(operations.setSafety({ muted: true })).rejects.toThrow("config write failed");
    expect(applySafety).not.toHaveBeenCalled();
    expect(operations.getSnapshot().muted).toBe(false);
  });

  it("serializes concurrent global safety updates before computing their next state", async () => {
    let persisted: PlaybackSafetyState = { paused: false, muted: false, doNotDisturb: false };
    let pending: Promise<unknown> = Promise.resolve();
    const applied: PlaybackSafetyState[] = [];
    const operations = service({
      persistSafety(patch) {
        const result = pending.then(() => {
          persisted = { ...persisted, ...patch };
          return persisted;
        });
        pending = result.catch(() => undefined);
        return result;
      },
      async applySafety(state) {
        applied.push(state);
      }
    });

    await Promise.all([
      operations.setSafety({ paused: true }),
      operations.setSafety({ muted: true })
    ]);

    expect(persisted).toEqual({ paused: true, muted: true, doNotDisturb: false, moduleMutes: { alerts: true, "screen-effects": true } });
    expect(operations.getSnapshot()).toMatchObject({ paused: true, muted: true, doNotDisturb: false });
    expect(applied.at(-1)).toEqual({ paused: true, muted: true, doNotDisturb: false, moduleMutes: { alerts: true, "screen-effects": true } });
  });

  it("keeps a module pause when global playback resumes", async () => {
    const effects = owner("screen-effects", { paused: true });
    let safety = { paused: true, muted: false, doNotDisturb: false };
    const operations = new PlaybackOperationsService({
      owners: [effects],
      initialSafety: safety,
      persistSafety: async (patch) => (safety = { ...safety, ...patch }),
      applySafety: async () => {}
    });

    const snapshot = await operations.setSafety({ paused: false });

    expect(snapshot.paused).toBe(false);
    expect(snapshot.owners).toEqual([{ moduleId: "screen-effects", paused: true }]);
  });

  it("does not report persisted safety as failed when runtime reporting also fails", async () => {
    const operations = service({
      applySafety: async () => { throw new Error("output failed"); },
      onSafetyApplyFailure: async () => { throw new Error("reporter failed"); }
    });

    await expect(operations.setSafety({ muted: true })).resolves.toMatchObject({ muted: true });
  });

  it("rejects unknown owners before dispatch", async () => {
    await expect(service().remove("missing", "one")).rejects.toBeInstanceOf(UnknownPlaybackOwnerError);
  });
});


describe("module mute policy", () => {
  it("persists independent modules, applies All to both, and reports output failure", async () => {
    let saved: PlaybackSafetyState = { paused: false, muted: true, doNotDisturb: false };
    const apply = vi.fn(async () => {});
    const operations = service({ persistSafety: async patch => (saved = { ...saved, ...patch }), applySafety: apply });
    expect(operations.getModuleMuteState()).toEqual({ alerts: false, "screen-effects": false });
    await operations.setModulesMuted(["alerts"], true);
    expect(saved.moduleMutes).toEqual({ alerts: true, "screen-effects": false });
    expect(operations.getSnapshot().muted).toBe(false);
    await operations.setModulesMuted(["screen-effects"], true);
    expect(operations.getSnapshot().muted).toBe(true);
    await operations.setSafety({ muted: false });
    expect(operations.getModuleMuteState()).toEqual({ alerts: false, "screen-effects": false });
    apply.mockRejectedValueOnce(new Error("device unavailable"));
    await operations.setModulesMuted(["alerts"], true);
    expect(operations.getModuleMuteState().alerts).toBe(true);
    expect(operations.getMuteOutputStatus().status).toBe("failed");
    await operations.restoreSafety(saved);
    expect(operations.getMuteOutputStatus().status).toBe("applied");
  });
  it("serializes toggles with management pause and guards clear identities", async () => {
    const alerts = owner("alerts", { queued: [row("alerts", "first")] });
    const operations = service({ owners: [alerts] });
    await Promise.all([operations.setModulePaused("alerts", true), operations.toggleModulePaused("alerts")]);
    expect(alerts.snapshot().paused).toBe(false);
    await expect(operations.clearPendingGuarded("alerts", 1, ["replacement"])).rejects.toBeInstanceOf(PlaybackOperationsConflictError);
    expect(alerts.clearPending).not.toHaveBeenCalled();
    await operations.clearPendingGuarded("alerts", 1, ["first"]);
    expect(alerts.clearPending).toHaveBeenCalledOnce();
  });
});
