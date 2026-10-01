import {
  privateAudioMediaAssetSchema,
  monitorMediaProgress,
  type PlaybackTimingDiagnostics,
  deviceAudioBatchSchema,
  prepareTimedMedia,
  prepareMediaAtStart,
  resolveAudioEnvelope,
  serializeException,
  TimedMediaPreparationError,
  type PrivateDesktopMediaAsset,
  type DeviceAudioFailure,
  type AudioOutputDevice,
  type DeviceAudioBatch,
  type DeviceAudioResult,
  type PlaybackTiming
} from "@stream-jams/core";

const START_TIMEOUT_MS = 5_000;
const DEVICE_POLL_INTERVAL_MS = 1_000;
const DEVICE_ENUMERATION_TIMEOUT_MS = 5_000;

export type AudioPlayerAsset = PrivateDesktopMediaAsset;

export interface PlayerMediaElement {
  currentTime: number;
  readonly readyState: number;
  readonly seeking: boolean;
  readonly error?: unknown;
  volume: number;
  muted: boolean;
  setSinkId(id: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  remove(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface DeviceAudioPlayerDependencies {
  readonly createElement: (source: string) => PlayerMediaElement;
  readonly createSource: (asset: AudioPlayerAsset) => string;
  readonly revokeSource: (source: string) => void;
  readonly listOutputDevices: () => Promise<readonly AudioOutputDevice[]>;
  readonly createAmplifier?: ((element: PlayerMediaElement, deviceId: string) => Promise<{ setGain(gain: number): void; dispose(): void }>) | undefined;
  readonly now?: () => number;
}

export interface DeviceAudioPlayRequest {
  readonly generation: number;
  readonly batch: DeviceAudioBatch;
  readonly assets: readonly AudioPlayerAsset[];
  readonly deadlineMs: number;
  readonly startDeadlineMs?: number;
}

type AttemptOutcome = "complete" | "cancelled" | "failed";

interface ElementAttempt {
  readonly preparation: AbortController;
  readonly element: PlayerMediaElement;
  readonly deviceId: string;
  readonly routeIds: readonly string[];
  readonly layerId: string;
  readonly assetId: string;
  readonly completion: Promise<AttemptOutcome>;
  startGuard: Promise<void>;
  started: boolean;
  progress: ReturnType<typeof monitorMediaProgress> | null;
  preparationDurationMs: number;
  completionReason: PlaybackTimingDiagnostics["completionReason"];
  completeConfigured(): void;
  startsAtEpochMs: number | null;
  scheduledStartEpochMs: number | null;
  playbackTimer: ReturnType<typeof setTimeout> | null;
  updateEnvelope(): void;
  terminal: boolean;
  startTimer: ReturnType<typeof setTimeout> | null;
  envelopeTimer: ReturnType<typeof setInterval> | null;
  amplifier: { setGain(gain: number): void; dispose(): void } | null;
  gain: number;
  stage: DeviceAudioFailure["stage"];
  finish(outcome: AttemptOutcome, cause?: unknown): void;
}

interface PreparedStart {
  ready: Promise<void>[];
  start: Promise<number>;
  release(startsAtEpochMs: number): void;
}

interface ActiveOccurrence {
  readonly key: string;
  readonly generation: number;
  readonly playbackId: string;
  readonly documentId: string;
  readonly sources: readonly string[];
  readonly attempts: ElementAttempt[];
  readonly failedRouteIds: Set<string>;
  readonly failures: DeviceAudioFailure[];
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
}

function isExplicitDeviceId(deviceId: string): boolean {
  return deviceId.trim() === deviceId && deviceId !== "" && deviceId !== "default" && deviceId !== "communications";
}

function allRouteIds(batch: DeviceAudioBatch): readonly string[] {
  return batch.destinations.flatMap((destination) => destination.routeIds);
}

function occurrenceKey(generation: number, batch: DeviceAudioBatch): string {
  return JSON.stringify([generation, batch.playbackId, batch.documentId]);
}

function cleanupElement(attempt: ElementAttempt, ended: EventListener, error: EventListener): void {
  attempt.progress?.stop();
  attempt.preparation.abort();
  if (attempt.startTimer !== null) {
    clearTimeout(attempt.startTimer);
    attempt.startTimer = null;
  }
  if (attempt.playbackTimer !== null) { clearTimeout(attempt.playbackTimer); attempt.playbackTimer = null; }
  if (attempt.envelopeTimer !== null) {
    clearInterval(attempt.envelopeTimer);
    attempt.envelopeTimer = null;
  }
  try { attempt.element.removeEventListener("ended", ended); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.element.removeEventListener("error", error); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.element.pause(); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.amplifier?.dispose(); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.element.removeAttribute("src"); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.element.load(); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
  try { attempt.element.remove(); }
  // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
  catch { /* cleanup is best-effort */ }
}

export class DeviceAudioPlayer {
  readonly #dependencies: DeviceAudioPlayerDependencies;
  readonly #now: () => number;
  readonly #active = new Map<string, ActiveOccurrence>();
  readonly #prepared = new Map<string, { playbackId: string; gate: PreparedStart; result: Promise<DeviceAudioResult>; timer: ReturnType<typeof setTimeout> }>();
  #activeGeneration: number | null = null;
  #currentMuted = false;
  #devicePollTimer: ReturnType<typeof setInterval> | null = null;
  #enumerationInFlight: Promise<readonly AudioOutputDevice[] | null> | null = null;
  #enumerationDeadlineMs = 0;

  constructor(dependencies: DeviceAudioPlayerDependencies) {
    this.#dependencies = dependencies;
    this.#now = dependencies.now ?? Date.now;
  }

  initialize(generation: number, muted: boolean): void {
    this.#validateGeneration(generation);
    const changed = generation !== this.#activeGeneration;
    this.#activeGeneration = generation;
    this.#currentMuted = muted;
    if (changed) {
      this.#discardPrepared();
      for (const occurrence of this.#active.values()) this.#cancelOccurrence(occurrence, "cancelled");
      this.#updateDevicePolling();
    } else {
      this.#applyMute();
    }
  }

  async prepare(token: string, request: DeviceAudioPlayRequest): Promise<void> {
    if (this.#prepared.has(token) || this.#prepared.size >= 64) throw new Error("Audio preparation capacity exceeded.");
    let release!: (startsAtEpochMs: number) => void;
    const gate: PreparedStart = { ready: [], start: new Promise(resolve => { release = resolve; }), release: value => release(value) };
    const result = this.#play(request, gate, token);
    const timer = setTimeout(() => { this.stop(request.batch.playbackId); }, 15000);
    this.#prepared.set(token, { playbackId: request.batch.playbackId, gate, result, timer });
    void result.finally(() => { gate.release(this.#now()); }).catch(
      // error-provenance: allow cleanup -- the start handle retains the original result and error
      () => undefined);
    await Promise.race([Promise.all(gate.ready), result]);
  }

  start(token: string, startsAtEpochMs: number): Promise<DeviceAudioResult> {
    const prepared = this.#prepared.get(token);
    if (prepared === undefined) return Promise.reject(new Error("Prepared audio is no longer available."));
    this.#prepared.delete(token);
    clearTimeout(prepared.timer);
    prepared.gate.release(startsAtEpochMs);
    return prepared.result;
  }

  play(request: DeviceAudioPlayRequest): Promise<DeviceAudioResult> { return this.#play(request); }

  async #play(request: DeviceAudioPlayRequest, gate?: PreparedStart, token?: string): Promise<DeviceAudioResult> {
    this.#validateRequest(request);
    const failedRouteIds = allRouteIds(request.batch);
    if (request.generation !== this.#activeGeneration || request.deadlineMs <= this.#now()) {
      return { failedRouteIds };
    }

    const key = token ?? occurrenceKey(request.generation, request.batch);
    if (this.#active.has(key)) {
      throw new Error(`Audio occurrence/document is already active: ${request.batch.playbackId}/${request.batch.documentId}`);
    }

    const sourcesByAssetId = new Map<string, string>();
    const sourceErrors = new Map<string, unknown>();
    for (const asset of request.assets) {
      try {
        sourcesByAssetId.set(asset.assetId, this.#dependencies.createSource(asset));
      }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch (error) {
        sourceErrors.set(asset.assetId, error);
      }
    }

    const occurrence: ActiveOccurrence = {
      key,
      generation: request.generation,
      playbackId: request.batch.playbackId,
      documentId: request.batch.documentId,
      sources: [...sourcesByAssetId.values()],
      attempts: [],
      failedRouteIds: new Set<string>(),
      failures: [],
      deadlineTimer: null,
      cancelled: false
    };
    this.#active.set(key, occurrence);

    if (gate !== undefined) void gate.start.then(() => {
      if (occurrence.deadlineTimer !== null) clearTimeout(occurrence.deadlineTimer);
      occurrence.deadlineTimer = null;
    });
    const deadlineDelay = Math.max(0, request.deadlineMs - this.#now());
    occurrence.deadlineTimer = setTimeout(() => {
      for (const attempt of occurrence.attempts) {
        if (attempt.started) attempt.completeConfigured(); else attempt.finish("failed");
      }
    }, deadlineDelay);

    for (const destination of request.batch.destinations) {
      for (const layer of request.batch.layers) {
        try {
          const source = sourcesByAssetId.get(layer.assetId);
          if (source === undefined) {
            for (const routeId of destination.routeIds) occurrence.failedRouteIds.add(routeId);
            this.#recordFailure(occurrence, destination.routeIds, layer.layerId, layer.assetId, "source-load", sourceErrors.get(layer.assetId) ?? new Error("Audio asset was not prepared."));
            continue;
          }
          const element = this.#dependencies.createElement(source);
          const attempt = this.#createAttempt(occurrence, element, destination.deviceId, destination.routeIds, layer.layerId, layer.assetId);
          occurrence.attempts.push(attempt);
          const startsAtEpochMs = request.batch.timing?.startsAtEpochMs ?? this.#now();
          const updateEnvelope = () => {
            attempt.gain = resolveAudioEnvelope({
              volume: layer.volume,
              elapsedMs: gate === undefined ? this.#now() - startsAtEpochMs : attempt.startsAtEpochMs === null ? 0 : this.#now() - attempt.startsAtEpochMs,
              fadeInMs: layer.fadeInMs ?? 0,
              fadeOutMs: layer.fadeOutMs ?? 0,
              playbackDurationMs: layer.playbackDurationMs ?? request.batch.durationMs,
              muted: false
            });
            if (attempt.amplifier === null) element.volume = Math.min(1, attempt.gain);
            else attempt.amplifier.setGain(attempt.gain);
          };
          attempt.updateEnvelope = updateEnvelope;
          updateEnvelope();
          attempt.envelopeTimer = setInterval(updateEnvelope, 25);
          element.muted = this.#currentMuted;
          this.#startAttempt(occurrence, attempt, request.deadlineMs, request.startDeadlineMs, request.batch.timing, layer.volume > 1, gate, layer.playbackDurationMs ?? request.batch.durationMs);
        }
        // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
        catch (error) {
          for (const routeId of destination.routeIds) occurrence.failedRouteIds.add(routeId);
          this.#recordFailure(occurrence, destination.routeIds, layer.layerId, layer.assetId, "source-load", error);
        }
      }
    }

    this.#updateDevicePolling();
    try {
      const outcomes = await Promise.all(occurrence.attempts.map((attempt) => attempt.completion));
      for (let index = 0; index < outcomes.length; index += 1) {
        if (outcomes[index] !== "failed") continue;
        for (const routeId of occurrence.attempts[index]!.routeIds) occurrence.failedRouteIds.add(routeId);
      }
      return {
        outputDiagnostics: occurrence.attempts.slice(0, 64).map((attempt, index) => ({
          routeIds: [...attempt.routeIds], layerId: attempt.layerId, assetId: attempt.assetId,
          diagnostics: {
            preparationDurationMs: attempt.preparationDurationMs,
            ...(attempt.scheduledStartEpochMs === null ? {} : { scheduledStartEpochMs: attempt.scheduledStartEpochMs }),
            ...(attempt.startsAtEpochMs === null ? {} : { actualStartEpochMs: attempt.startsAtEpochMs }),
            terminalOutcome: outcomes[index] === "cancelled" ? "stopped" as const : outcomes[index] === "failed" ? "failed" as const : "completed" as const,
            ...(attempt.completionReason === undefined ? {} : { completionReason: attempt.completionReason })
          }
        })),
        diagnostics: {
          ...(request.batch.timing === undefined && occurrence.attempts[0]?.scheduledStartEpochMs == null ? {} : { scheduledStartEpochMs: request.batch.timing?.startsAtEpochMs ?? occurrence.attempts[0]!.scheduledStartEpochMs! }),
          ...(occurrence.attempts.some(attempt => attempt.startsAtEpochMs !== null) ? { actualStartEpochMs: Math.min(...occurrence.attempts.flatMap(attempt => attempt.startsAtEpochMs === null ? [] : [attempt.startsAtEpochMs])) } : {}),
          preparationDurationMs: Math.max(0, ...occurrence.attempts.map(attempt => attempt.preparationDurationMs)),
          terminalOutcome: occurrence.cancelled ? "stopped" : occurrence.failedRouteIds.size > 0 ? "failed" : "completed",
          ...(occurrence.attempts.some(attempt => attempt.completionReason === "stalled") ? { completionReason: "stalled" as const } : occurrence.cancelled || occurrence.failedRouteIds.size > 0 ? {} : { completionReason: occurrence.attempts.some(attempt => attempt.completionReason === "configured-duration") ? "configured-duration" as const : "natural-end" as const })
        },
        failedRouteIds: failedRouteIds.filter((routeId) => occurrence.failedRouteIds.has(routeId)),
        ...(occurrence.failures.length === 0 ? {} : { failures: occurrence.failures })
      };
    } finally {
      if (occurrence.deadlineTimer !== null) clearTimeout(occurrence.deadlineTimer);
      for (const source of occurrence.sources) this.#revokeSource(source);
      this.#updateDevicePolling();
      void Promise.all(occurrence.attempts.map((attempt) => attempt.startGuard)).then(() => {
        if (this.#active.get(key) === occurrence) this.#active.delete(key);
        this.#updateDevicePolling();
      });
    }
  }

  setMuted(muted: boolean): void {
    this.#currentMuted = muted;
    this.#applyMute();
  }

  stop(playbackId: string): void {
    this.#discardPrepared(playbackId);
    for (const occurrence of this.#active.values()) {
      if (occurrence.playbackId === playbackId) this.#cancelOccurrence(occurrence, "cancelled");
    }
    this.#updateDevicePolling();
  }

  close(): void {
    this.#activeGeneration = null;
    this.#discardPrepared();
    for (const occurrence of this.#active.values()) this.#cancelOccurrence(occurrence, "cancelled");
    this.#updateDevicePolling();
  }

  #discardPrepared(playbackId?: string): void {
    for (const [token, prepared] of this.#prepared) {
      if (playbackId !== undefined && prepared.playbackId !== playbackId) continue;
      clearTimeout(prepared.timer);
      prepared.gate.release(this.#now());
      this.#prepared.delete(token);
    }
  }

  async reconcileDevices(): Promise<void> {
    if (!this.#hasLiveOccurrences()) return;
    const devices = await this.#listOutputDevicesBounded();
    if (devices === null || !this.#hasLiveOccurrences()) return;

    const availableIds = new Set(devices
      .map((device) => device.deviceId)
      .filter(isExplicitDeviceId));
    for (const occurrence of this.#active.values()) {
      if (occurrence.cancelled) continue;
      for (const attempt of occurrence.attempts) {
        if (!attempt.terminal && !availableIds.has(attempt.deviceId)) {
          attempt.stage = "device-lost";
          attempt.finish("failed", new Error("The selected audio device is no longer available."));
        }
      }
    }
  }

  #createAttempt(
    occurrence: ActiveOccurrence,
    element: PlayerMediaElement,
    deviceId: string,
    routeIds: readonly string[],
    layerId: string,
    assetId: string
  ): ElementAttempt {
    let resolve!: (outcome: AttemptOutcome) => void;
    const completion = new Promise<AttemptOutcome>((done) => { resolve = done; });
    const attempt: ElementAttempt = {
      preparation: new AbortController(),
      element,
      deviceId,
      routeIds,
      layerId,
      assetId,
      completion,
      startGuard: Promise.resolve(),
      started: false,
      progress: null,
      preparationDurationMs: 0,
      completionReason: undefined,
      completeConfigured: () => undefined,
      startsAtEpochMs: null,
      scheduledStartEpochMs: null,
      playbackTimer: null,
      updateEnvelope: () => undefined,
      terminal: false,
      startTimer: null,
      envelopeTimer: null,
      amplifier: null,
      gain: 1,
      stage: "device-bind",
      finish: () => undefined
    };
    const ended: EventListener = () => { attempt.completionReason = "natural-end"; attempt.finish("complete"); };
    attempt.completeConfigured = () => {
      if (attempt.terminal || attempt.progress?.finish() === false) return;
      attempt.completionReason = "configured-duration";
      attempt.finish("complete");
    };
    const error: EventListener = () => {
      attempt.stage = "decode";
      attempt.finish("failed", element.error ?? new Error("Audio decoding failed."));
    };
    attempt.finish = (outcome, cause) => {
      if (attempt.terminal) return;
      attempt.terminal = true;
      if (outcome === "failed" && cause === undefined && attempt.stage === "metadata" && element.readyState >= 1) attempt.stage = "seek";
      if (outcome === "failed") this.#recordFailure(occurrence, routeIds, layerId, assetId, attempt.stage, cause ?? new Error("Audio preparation deadline exceeded."));
      cleanupElement(attempt, ended, error);
      resolve(outcome);
    };
    element.addEventListener("ended", ended);
    element.addEventListener("error", error);
    return attempt;
  }

  #startAttempt(occurrence: ActiveOccurrence, attempt: ElementAttempt, deadlineMs: number, upstreamStartDeadlineMs?: number, timing?: PlaybackTiming, amplified = false, gate?: PreparedStart, playbackDurationMs = 0): void {
    const preparationStartedAt = this.#now();
    let markReady!: () => void;
    if (gate !== undefined) gate.ready.push(new Promise(resolve => { markReady = resolve; }));
    const startDeadlineMs = Math.min(deadlineMs, this.#now() + START_TIMEOUT_MS, upstreamStartDeadlineMs ?? Infinity);
    const startDelay = Math.max(0, startDeadlineMs - this.#now());
    attempt.startTimer = setTimeout(() => attempt.finish("failed"), startDelay);
    let releaseGuard!: () => void;
    const guardCompletion = new Promise<void>((resolve) => { releaseGuard = resolve; });
    const guardTimer = setTimeout(() => { markReady?.(); releaseGuard(); }, startDelay);
    attempt.startGuard = guardCompletion;
    const releasePreparation = () => { clearTimeout(guardTimer); markReady?.(); releaseGuard(); };
    if (gate !== undefined) attempt.preparation.signal.addEventListener("abort", releasePreparation, { once: true });
    void (async () => {
      try {
        if (amplified) {
          if (this.#dependencies.createAmplifier === undefined) throw new Error("Amplified device audio is unavailable");
          const amplifier = await this.#dependencies.createAmplifier(attempt.element, attempt.deviceId);
          if (!this.#isCurrent(occurrence, attempt)) { amplifier.dispose(); return; }
          attempt.amplifier = amplifier;
          amplifier.setGain(attempt.gain);
        } else {
          await attempt.element.setSinkId(attempt.deviceId);
        }
        if (!this.#isCurrent(occurrence, attempt)) return;
        if (this.#now() >= startDeadlineMs) { attempt.finish("failed"); return; }
        if (gate !== undefined) {
          attempt.stage = "metadata";
          await prepareMediaAtStart(attempt.element, { signal: attempt.preparation.signal, deadlineMs: startDeadlineMs, now: this.#now });
          if (attempt.startTimer !== null) { clearTimeout(attempt.startTimer); attempt.startTimer = null; }
          attempt.preparationDurationMs = Math.min(300000, Math.max(0, this.#now() - preparationStartedAt));
          markReady();
          const startsAtEpochMs = await gate.start;
          attempt.scheduledStartEpochMs = startsAtEpochMs;
          if (!this.#isCurrent(occurrence, attempt)) return;
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); attempt.preparation.signal.removeEventListener("abort", finish); resolve(); };
            const timer = setTimeout(finish, Math.max(0, startsAtEpochMs - this.#now()));
            attempt.preparation.signal.addEventListener("abort", finish, { once: true });
          });
          if (!this.#isCurrent(occurrence, attempt)) return;
        } else if (timing !== undefined) {
          attempt.stage = "metadata";
          await prepareTimedMedia(attempt.element, timing, { signal: attempt.preparation.signal, deadlineMs: startDeadlineMs, now: this.#now });
          if (!this.#isCurrent(occurrence, attempt)) return;
          if (this.#now() >= Math.min(startDeadlineMs, timing.endsAtEpochMs)) { attempt.finish("failed"); return; }
        }
        if (gate === undefined) attempt.preparationDurationMs = Math.min(300000, Math.max(0, this.#now() - preparationStartedAt));
        attempt.element.muted = this.#currentMuted;
        attempt.stage = "play";
        if (gate !== undefined) attempt.startTimer = setTimeout(() => attempt.finish("failed", new Error("Audio play deadline exceeded.")), START_TIMEOUT_MS);
        const playPromise = attempt.element.play();
        if (!this.#isCurrent(occurrence, attempt)) return;
        await Promise.race([playPromise, attempt.completion]);
        if (!this.#isCurrent(occurrence, attempt)) return;
        attempt.started = true;
        attempt.startsAtEpochMs = this.#now();
        attempt.progress = monitorMediaProgress(attempt.element, error => {
          attempt.stage = "stall";
          attempt.completionReason = "stalled";
          attempt.finish("failed", attempt.element.error ?? error);
        }, this.#now);
        if (gate !== undefined) {
          attempt.startsAtEpochMs = this.#now();
          attempt.updateEnvelope();
          attempt.playbackTimer = setTimeout(() => attempt.completeConfigured(), playbackDurationMs);
        }
        if (attempt.startTimer !== null) {
          clearTimeout(attempt.startTimer);
          attempt.startTimer = null;
        }
      }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch (error) {
        if (error instanceof TimedMediaPreparationError) attempt.stage = error.stage;
        if (!attempt.terminal) attempt.finish("failed", error);
      } finally {
        attempt.preparation.signal.removeEventListener("abort", releasePreparation);
        markReady?.();
        clearTimeout(guardTimer);
        releaseGuard();
      }
    })();
  }

  #isCurrent(occurrence: ActiveOccurrence, attempt: ElementAttempt): boolean {
    return !attempt.terminal && !occurrence.cancelled && occurrence.generation === this.#activeGeneration &&
      this.#active.get(occurrence.key) === occurrence;
  }

  #recordFailure(occurrence: ActiveOccurrence, routeIds: readonly string[], layerId: string, assetId: string, stage: DeviceAudioFailure["stage"], error: unknown): void {
    if (occurrence.failures.length < 64) occurrence.failures.push({ routeIds, layerId, assetId, stage, exception: serializeException(error) });
  }

  #cancelOccurrence(occurrence: ActiveOccurrence, outcome: AttemptOutcome): void {
    if (occurrence.cancelled) return;
    occurrence.cancelled = true;
    if (occurrence.deadlineTimer !== null) {
      clearTimeout(occurrence.deadlineTimer);
      occurrence.deadlineTimer = null;
    }
    for (const attempt of occurrence.attempts) attempt.finish(outcome);
  }

  #applyMute(): void {
    for (const occurrence of this.#active.values()) {
      for (const attempt of occurrence.attempts) {
        if (!attempt.terminal) attempt.element.muted = this.#currentMuted;
      }
    }
  }

  #validateGeneration(generation: number): void {
    if (!Number.isInteger(generation) || generation <= 0) throw new Error("Audio player generation must be a positive integer.");
  }

  #validateRequest(request: DeviceAudioPlayRequest): void {
    this.#validateGeneration(request.generation);
    if (!Number.isFinite(request.deadlineMs)) throw new Error("Audio playback deadline must be finite.");
    if (request.startDeadlineMs !== undefined && !Number.isFinite(request.startDeadlineMs)) throw new Error("Audio startup deadline must be finite.");
    const parsed = deviceAudioBatchSchema.safeParse(request.batch);
    if (!parsed.success) throw new Error("Device audio batch is invalid.");
    if (request.batch.layers.length === 0 || request.batch.destinations.length === 0) {
      throw new Error("Device audio playback requires layers and explicit destinations.");
    }

    const referencedAssetIds = new Set(request.batch.layers.map((layer) => layer.assetId));
    const receivedAssetIds = new Set<string>();
    if (request.assets.length > 64) throw new Error("Device audio asset capacity exceeded.");
    for (const asset of request.assets) {
      if (!privateAudioMediaAssetSchema.safeParse(asset).success || receivedAssetIds.has(asset.assetId) ||
          !referencedAssetIds.has(asset.assetId)) {
        throw new Error("Device audio assets must be bounded, unique, supported and referenced by the batch.");
      }
      receivedAssetIds.add(asset.assetId);
    }
  }

  #updateDevicePolling(): void {
    if (this.#hasLiveOccurrences() && this.#devicePollTimer === null) {
      this.#devicePollTimer = setInterval(() => {
        if (this.#enumerationInFlight === null) void this.reconcileDevices();
      }, DEVICE_POLL_INTERVAL_MS);
      return;
    }
    if (!this.#hasLiveOccurrences() && this.#devicePollTimer !== null) {
      clearInterval(this.#devicePollTimer);
      this.#devicePollTimer = null;
    }
  }

  #hasLiveOccurrences(): boolean {
    return [...this.#active.values()].some((occurrence) => !occurrence.cancelled &&
      occurrence.attempts.some((attempt) => !attempt.terminal));
  }

  async #listOutputDevicesBounded(): Promise<readonly AudioOutputDevice[] | null> {
    let pending = this.#enumerationInFlight;
    if (pending === null) {
      this.#enumerationDeadlineMs = this.#now() + DEVICE_ENUMERATION_TIMEOUT_MS;
      pending = Promise.resolve()
        .then(() => this.#dependencies.listOutputDevices())
        .then((devices) => devices, () => null);
      this.#enumerationInFlight = pending;
      void pending.then(() => {
        if (this.#enumerationInFlight === pending) {
          this.#enumerationInFlight = null;
          this.#enumerationDeadlineMs = 0;
        }
      });
    }

    return await new Promise<readonly AudioOutputDevice[] | null>((resolve) => {
      let settled = false;
      const remainingMs = Math.max(0, this.#enumerationDeadlineMs - this.#now());
      const timeout = setTimeout(() => {
        settled = true;
        resolve(null);
      }, remainingMs);
      void pending.then((devices) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(devices);
      });
    });
  }

  #revokeSource(source: string): void {
    try { this.#dependencies.revokeSource(source); }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch { /* cleanup is best-effort */ }
  }
}
