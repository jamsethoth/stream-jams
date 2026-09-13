import {
  overlayInstructionSchema,
  type AudioPlaybackSink,
  type EffectOccurrence,
  type EffectQueue,
  type EffectQueueSnapshot,
  type OverlayInstruction,
  type OverlayModuleSnapshot,
  type OverlayModuleSnapshotRequest,
  type PlaybackSafetyState,
  type ResolvedAlertAudio
} from "@stream-jams/core";
import type {
  DesktopVisualPlaybackSink,
  OverlayPlaybackInstructionSink
} from "../playback/playback-coordinator.js";

export interface EffectPlaybackAudioOutputService {
  preparePlayback(playbackId: string, audio: readonly ResolvedAlertAudio[]): Promise<{
    readonly batches: readonly Parameters<AudioPlaybackSink["play"]>[0][];
    readonly unavailableRouteIds: readonly string[];
  }>;
}

export interface EffectPlaybackCoordinatorOptions {
  readonly queue: EffectQueue;
  readonly getSafety: () => PlaybackSafetyState;
  readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink | undefined;
  readonly desktopVisualSink?: DesktopVisualPlaybackSink | undefined;
  readonly audioOutputService?: EffectPlaybackAudioOutputService | undefined;
  readonly audioPlaybackSink?: AudioPlaybackSink | undefined;
  readonly now?: (() => number) | undefined;
}

interface BrowserObligation {
  pendingClients: Set<string>;
}

interface ActivePlayback {
  readonly occurrence: EffectOccurrence;
  readonly transportId: string;
  readonly browserInstructions: readonly OverlayInstruction[];
  readonly browser: Map<string, BrowserObligation>;
  desktopPending: boolean;
  audioPending: boolean;
  hadRecipient: boolean;
  hadFailure: boolean;
  finished: boolean;
  stopping: Promise<boolean> | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const COMPLETION_GRACE_MS = 5_000;
const START_DELAY_MS = 100;

export function effectOccurrenceKey(moduleId: string, occurrenceId: string): string {
  return JSON.stringify([moduleId, occurrenceId]);
}

export class EffectPlaybackCoordinator {
  readonly #queue: EffectQueue;
  readonly #getSafety: () => PlaybackSafetyState;
  readonly #overlayPlaybackSink: OverlayPlaybackInstructionSink | null;
  readonly #desktopVisualSink: DesktopVisualPlaybackSink | null;
  readonly #audioOutputService: EffectPlaybackAudioOutputService | null;
  readonly #audioPlaybackSink: AudioPlaybackSink | null;
  readonly #now: () => number;
  #active: ActivePlayback | null = null;
  #closed = false;
  #starting = false;
  #closePromise: Promise<void> | null = null;

  constructor(options: EffectPlaybackCoordinatorOptions) {
    this.#queue = options.queue;
    this.#getSafety = options.getSafety;
    this.#overlayPlaybackSink = options.overlayPlaybackSink ?? null;
    this.#desktopVisualSink = options.desktopVisualSink ?? null;
    this.#audioOutputService = options.audioOutputService ?? null;
    this.#audioPlaybackSink = options.audioPlaybackSink ?? null;
    this.#now = options.now ?? Date.now;
  }

  getSnapshot(): EffectQueueSnapshot {
    return this.#queue.snapshot();
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const instructions = this.#active?.browserInstructions.filter((instruction) =>
      instruction.overlayId === request.overlayId
      && instruction.moduleId === request.moduleId
      && instruction.purpose === request.purpose
      && instruction.scope === request.scope
      && (instruction.targetProfileId ?? null) === (request.targetProfileId ?? null)
    ) ?? [];
    return {
      moduleId: "screen-effects",
      enabled: true,
      instructions: structuredClone(instructions)
    };
  }

  async startNext(): Promise<void> {
    if (this.#closed || this.#starting || this.#active !== null) return;
    this.#starting = true;
    try {
      const occurrence = this.#queue.advance(this.#getSafety());
      if (occurrence !== null) this.#start(occurrence);
    } finally {
      this.#starting = false;
    }
  }

  reportInstructionFinished(
    clientId: string,
    instructionId: string,
    failed = false
  ): EffectQueueSnapshot {
    const state = this.#active;
    const obligation = state?.browser.get(instructionId);
    if (state === null || state === undefined || obligation === undefined || state.finished) {
      return this.#queue.snapshot();
    }
    obligation.pendingClients.delete(clientId);
    if (failed) state.hadFailure = true;
    if (obligation.pendingClients.size === 0) state.browser.delete(instructionId);
    this.#maybeComplete(state);
    return this.#queue.snapshot();
  }

  reportClientDisconnected(clientId: string): EffectQueueSnapshot {
    const state = this.#active;
    if (state === null || state.finished) return this.#queue.snapshot();
    for (const [instructionId, obligation] of state.browser) {
      obligation.pendingClients.delete(clientId);
      if (obligation.pendingClients.size === 0) state.browser.delete(instructionId);
    }
    this.#maybeComplete(state);
    return this.#queue.snapshot();
  }

  skip(occurrenceId: string): Promise<boolean> {
    return this.#stopAndComplete(occurrenceId, "skipped");
  }

  close(): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    this.#queue.setModulePaused(true);
    this.#queue.clearPending();
    const currentId = this.#queue.snapshot().current?.id;
    this.#closePromise = currentId === undefined
      ? Promise.resolve()
      : this.#stopAndComplete(currentId, "failed").then(() => undefined);
    return this.#closePromise;
  }

  #start(occurrence: EffectOccurrence): void {
    const transportId = effectOccurrenceKey("screen-effects", occurrence.id);
    const startsAtEpochMs = this.#now() + START_DELAY_MS;
    const browserInstructions = createBrowserInstructions(occurrence, startsAtEpochMs);
    const desktopInstructions = createDesktopInstructions(occurrence, startsAtEpochMs);
    const audio = createResolvedAudio(occurrence);
    const state: ActivePlayback = {
      occurrence,
      transportId,
      browserInstructions,
      browser: new Map(),
      desktopPending: desktopInstructions.length > 0 && this.#desktopVisualSink !== null,
      audioPending: audio.length > 0
        && this.#audioOutputService !== null
        && this.#audioPlaybackSink !== null,
      hadRecipient: false,
      hadFailure: false,
      finished: false,
      stopping: null,
      timer: null
    };
    this.#active = state;
    state.timer = this.#scheduleTimer(
      () => { void this.#stopAndComplete(occurrence.id, "failed"); },
      occurrence.content.variant.durationMs + COMPLETION_GRACE_MS
    );

    this.#dispatchBrowser(state, browserInstructions);
    if (state.desktopPending) {
      state.hadRecipient = true;
      void this.#desktopVisualSink!.play(transportId, desktopInstructions, startsAtEpochMs)
        .then(
          () => this.#settleDesktop(state, false),
          () => this.#settleDesktop(state, true)
        );
    }
    if (state.audioPending) {
      void this.#dispatchAudio(state, audio, startsAtEpochMs);
    }
    this.#maybeComplete(state);
  }

  #dispatchBrowser(state: ActivePlayback, instructions: readonly OverlayInstruction[]): void {
    if (this.#overlayPlaybackSink === null) return;
    for (const instruction of instructions) {
      try {
        const delivered = this.#overlayPlaybackSink.deliverPlaybackInstruction(instruction);
        const clients = new Set(delivered?.deliveredClientIds ?? []);
        if (clients.size > 0) {
          state.hadRecipient = true;
          state.browser.set(instruction.id, { pendingClients: clients });
        }
      } catch {
        // Other recipients remain independent.
      }
    }
  }

  async #dispatchAudio(
    state: ActivePlayback,
    audio: readonly ResolvedAlertAudio[],
    startsAtEpochMs: number
  ): Promise<void> {
    try {
      const prepared = await this.#audioOutputService!.preparePlayback(state.transportId, audio);
      if (!this.#isActive(state)) return;
      if (prepared.unavailableRouteIds.length > 0 || prepared.batches.length === 0) {
        state.hadFailure = true;
      }
      if (prepared.batches.length > 0) state.hadRecipient = true;
      const results = await Promise.allSettled(prepared.batches.map((batch) =>
        this.#audioPlaybackSink!.play({
          ...batch,
          muted: this.#getSafety().muted,
          timing: {
            startsAtEpochMs,
            endsAtEpochMs: startsAtEpochMs + batch.durationMs
          }
        })
      ));
      if (results.some((result) =>
        result.status === "rejected"
        || result.value.failedRouteIds.length > 0
      )) {
        state.hadFailure = true;
      }
    } catch {
      state.hadFailure = true;
    } finally {
      if (this.#isActive(state)) {
        state.audioPending = false;
        this.#maybeComplete(state);
      }
    }
  }

  #settleDesktop(state: ActivePlayback, failed: boolean): void {
    if (!this.#isActive(state)) return;
    if (failed) state.hadFailure = true;
    state.desktopPending = false;
    this.#maybeComplete(state);
  }

  #maybeComplete(state: ActivePlayback): void {
    if (
      !this.#isActive(state)
      || state.browser.size > 0
      || state.desktopPending
      || state.audioPending
    ) {
      return;
    }
    this.#complete(state, state.hadRecipient && !state.hadFailure ? "completed" : "failed");
  }

  #complete(state: ActivePlayback, status: "completed" | "failed"): boolean {
    if (!this.#isActive(state)) return false;
    state.finished = true;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    const completed = this.#queue.complete(state.occurrence.id, status, this.#now());
    this.#active = null;
    this.#scheduleNext();
    return completed;
  }

  #stopAndComplete(
    occurrenceId: string,
    status: "skipped" | "failed"
  ): Promise<boolean> {
    const state = this.#active;
    if (state === null || state.occurrence.id !== occurrenceId) return Promise.resolve(false);
    if (state.stopping !== null) return state.stopping;
    state.finished = true;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    try {
      this.#overlayPlaybackSink?.stopPlaybackInstructions?.(
        state.browserInstructions.map((instruction) => instruction.id)
      );
    } catch {
      // A disconnected browser cannot block local silence.
    }
    state.browser.clear();
    const stops = [
      ...(this.#audioPlaybackSink === null ? [] : [this.#audioPlaybackSink.stop(state.transportId)]),
      ...(this.#desktopVisualSink === null ? [] : [this.#desktopVisualSink.stop(state.transportId)])
    ];
    state.stopping = Promise.allSettled(stops).then(() => {
      if (this.#active !== state) return false;
      const completed = this.#queue.complete(occurrenceId, status, this.#now());
      this.#active = null;
      if (!this.#closed) this.#scheduleNext();
      return completed;
    });
    return state.stopping;
  }

  #isActive(state: ActivePlayback): boolean {
    return this.#active === state && !state.finished && !this.#closed;
  }

  #scheduleNext(): void {
    queueMicrotask(() => { void this.startNext(); });
  }

  #scheduleTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  }
}

interface BrowserTarget {
  readonly scope: "module" | "unified";
  readonly targetProfileId?: "landscape" | "vertical";
}

const browserTargets: readonly BrowserTarget[] = [
  { scope: "module" },
  { scope: "module", targetProfileId: "landscape" },
  { scope: "module", targetProfileId: "vertical" },
  { scope: "unified" }
];

function createBrowserInstructions(
  occurrence: EffectOccurrence,
  startsAtEpochMs: number
): readonly OverlayInstruction[] {
  const { variant } = occurrence.content;
  const purpose = occurrence.trigger === null ? "test" : "live";
  const instructions: OverlayInstruction[] = [];
  for (const target of browserTargets) {
    const suffix = `${target.scope}:${target.targetProfileId ?? "default"}`;
    if (variant.visual !== null && variant.visualOutputs.browserSource) {
      instructions.push(createInstruction({
        occurrence,
        id: `${effectOccurrenceKey("screen-effects", occurrence.id)}:visual:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: {
          assetId: variant.visual.assetId,
          mediaType: variant.visual.mediaType,
          layout: variant.visual.layout
        },
        audio: null
      }));
    }
    if (variant.outputs.browserSource && variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio) {
      instructions.push(createInstruction({
        occurrence,
        id: `${effectOccurrenceKey("screen-effects", occurrence.id)}:video-audio:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: null,
        audio: {
          assetId: variant.visual.assetId,
          volume: variant.visual.audioVolume,
          sourceKind: "video-soundtrack"
        }
      }));
    }
    if (variant.outputs.browserSource && variant.sound !== null) {
      instructions.push(createInstruction({
        occurrence,
        id: `${effectOccurrenceKey("screen-effects", occurrence.id)}:sound:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: null,
        audio: {
          assetId: variant.sound.assetId,
          volume: variant.sound.volume,
          sourceKind: "audio"
        }
      }));
    }
  }
  return instructions;
}

function createDesktopInstructions(
  occurrence: EffectOccurrence,
  startsAtEpochMs: number
): readonly OverlayInstruction[] {
  const { variant } = occurrence.content;
  if (variant.visual === null || !variant.visualOutputs.desktop) return [];
  return [createInstruction({
    occurrence,
    id: `${effectOccurrenceKey("screen-effects", occurrence.id)}:desktop-visual`,
    purpose: occurrence.trigger === null ? "test" : "live",
    target: { scope: "module", targetProfileId: "landscape" },
    startsAtEpochMs,
    visual: {
      assetId: variant.visual.assetId,
      mediaType: variant.visual.mediaType,
      layout: variant.visual.layout
    },
    audio: null
  })];
}

function createInstruction(input: {
  readonly occurrence: EffectOccurrence;
  readonly id: string;
  readonly purpose: "live" | "test";
  readonly target: BrowserTarget;
  readonly startsAtEpochMs: number;
  readonly visual: OverlayInstruction["visual"];
  readonly audio: OverlayInstruction["audio"];
}): OverlayInstruction {
  const durationMs = input.occurrence.content.variant.durationMs;
  return overlayInstructionSchema.parse({
    id: input.id,
    overlayId: "default",
    moduleId: "screen-effects",
    ...(input.occurrence.trigger === null ? { operatorTest: true } : {}),
    purpose: input.purpose,
    scope: input.target.scope,
    ...(input.target.targetProfileId === undefined ? {} : {
      targetProfileId: input.target.targetProfileId
    }),
    visual: input.visual,
    audio: input.audio,
    text: null,
    shape: null,
    animation: input.visual === null ? null : input.occurrence.content.variant.animation,
    tts: null,
    durationMs,
    timing: {
      startsAtEpochMs: input.startsAtEpochMs,
      endsAtEpochMs: input.startsAtEpochMs + durationMs
    }
  });
}

function createResolvedAudio(occurrence: EffectOccurrence): readonly ResolvedAlertAudio[] {
  const { variant } = occurrence.content;
  if (variant.outputs.deviceRouteIds.length === 0) return [];
  const layers: ResolvedAlertAudio["layers"][number][] = [];
  if (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio) {
    layers.push({
      sourceKind: "video-soundtrack",
      layerId: `${variant.id}:video`,
      assetId: variant.visual.assetId,
      volume: variant.visual.audioVolume
    });
  }
  if (variant.sound !== null) {
    layers.push({
      sourceKind: "audio",
      layerId: `${variant.id}:sound`,
      assetId: variant.sound.assetId,
      volume: variant.sound.volume
    });
  }
  return layers.length === 0 ? [] : [{
    documentId: occurrence.content.effectId,
    durationMs: variant.durationMs,
    outputs: structuredClone(variant.outputs),
    layers
  }];
}
