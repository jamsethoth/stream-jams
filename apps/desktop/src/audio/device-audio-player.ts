import {
  audioPlayerAssetSchema,
  deviceAudioBatchSchema,
  maxAudioTransportAssetBytes,
  maxAudioTransportBatchBytes,
  type AudioOutputDevice,
  type DeviceAudioBatch,
  type DeviceAudioResult
} from "@stream-jams/core";

const START_TIMEOUT_MS = 5_000;
const DEVICE_POLL_INTERVAL_MS = 1_000;
const DEVICE_ENUMERATION_TIMEOUT_MS = 5_000;

export interface AudioPlayerAsset {
  readonly assetId: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface PlayerMediaElement {
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
  readonly element: PlayerMediaElement;
  readonly deviceId: string;
  readonly routeIds: readonly string[];
  readonly completion: Promise<AttemptOutcome>;
  startGuard: Promise<void>;
  started: boolean;
  terminal: boolean;
  startTimer: ReturnType<typeof setTimeout> | null;
  finish(outcome: AttemptOutcome): void;
}

interface ActiveOccurrence {
  readonly key: string;
  readonly generation: number;
  readonly playbackId: string;
  readonly documentId: string;
  readonly sources: readonly string[];
  readonly attempts: ElementAttempt[];
  readonly failedRouteIds: Set<string>;
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
  if (attempt.startTimer !== null) {
    clearTimeout(attempt.startTimer);
    attempt.startTimer = null;
  }
  try { attempt.element.removeEventListener("ended", ended); } catch { /* cleanup is best-effort */ }
  try { attempt.element.removeEventListener("error", error); } catch { /* cleanup is best-effort */ }
  try { attempt.element.pause(); } catch { /* cleanup is best-effort */ }
  try { attempt.element.removeAttribute("src"); } catch { /* cleanup is best-effort */ }
  try { attempt.element.load(); } catch { /* cleanup is best-effort */ }
  try { attempt.element.remove(); } catch { /* cleanup is best-effort */ }
}

export class DeviceAudioPlayer {
  readonly #dependencies: DeviceAudioPlayerDependencies;
  readonly #now: () => number;
  readonly #active = new Map<string, ActiveOccurrence>();
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
      for (const occurrence of this.#active.values()) this.#cancelOccurrence(occurrence, "cancelled");
      this.#updateDevicePolling();
    } else {
      this.#applyMute();
    }
  }

  async play(request: DeviceAudioPlayRequest): Promise<DeviceAudioResult> {
    this.#validateRequest(request);
    const failedRouteIds = allRouteIds(request.batch);
    if (request.generation !== this.#activeGeneration || request.deadlineMs <= this.#now()) {
      return { failedRouteIds };
    }

    const key = occurrenceKey(request.generation, request.batch);
    if (this.#active.has(key)) {
      throw new Error(`Audio occurrence/document is already active: ${request.batch.playbackId}/${request.batch.documentId}`);
    }

    const sourcesByAssetId = new Map<string, string>();
    for (const asset of request.assets) {
      try {
        sourcesByAssetId.set(asset.assetId, this.#dependencies.createSource(asset));
      } catch {
        // A single undecodable asset must not abort healthy layers or devices.
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
      deadlineTimer: null,
      cancelled: false
    };
    this.#active.set(key, occurrence);

    const deadlineDelay = Math.max(0, request.deadlineMs - this.#now());
    occurrence.deadlineTimer = setTimeout(() => {
      for (const attempt of occurrence.attempts) {
        attempt.finish(attempt.started ? "complete" : "failed");
      }
    }, deadlineDelay);

    for (const destination of request.batch.destinations) {
      for (const layer of request.batch.layers) {
        try {
          const source = sourcesByAssetId.get(layer.assetId);
          if (source === undefined) {
            for (const routeId of destination.routeIds) occurrence.failedRouteIds.add(routeId);
            continue;
          }
          const element = this.#dependencies.createElement(source);
          const attempt = this.#createAttempt(occurrence, element, destination.deviceId, destination.routeIds);
          occurrence.attempts.push(attempt);
          element.volume = layer.volume;
          element.muted = this.#currentMuted;
          this.#startAttempt(occurrence, attempt, request.deadlineMs, request.startDeadlineMs);
        } catch {
          for (const routeId of destination.routeIds) occurrence.failedRouteIds.add(routeId);
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
        failedRouteIds: failedRouteIds.filter((routeId) => occurrence.failedRouteIds.has(routeId))
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
    for (const occurrence of this.#active.values()) {
      if (occurrence.playbackId === playbackId) this.#cancelOccurrence(occurrence, "cancelled");
    }
    this.#updateDevicePolling();
  }

  close(): void {
    this.#activeGeneration = null;
    for (const occurrence of this.#active.values()) this.#cancelOccurrence(occurrence, "cancelled");
    this.#updateDevicePolling();
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
        if (!attempt.terminal && !availableIds.has(attempt.deviceId)) attempt.finish("failed");
      }
    }
  }

  #createAttempt(
    occurrence: ActiveOccurrence,
    element: PlayerMediaElement,
    deviceId: string,
    routeIds: readonly string[]
  ): ElementAttempt {
    let resolve!: (outcome: AttemptOutcome) => void;
    const completion = new Promise<AttemptOutcome>((done) => { resolve = done; });
    const attempt: ElementAttempt = {
      element,
      deviceId,
      routeIds,
      completion,
      startGuard: Promise.resolve(),
      started: false,
      terminal: false,
      startTimer: null,
      finish: () => undefined
    };
    const ended: EventListener = () => attempt.finish("complete");
    const error: EventListener = () => attempt.finish("failed");
    attempt.finish = (outcome) => {
      if (attempt.terminal) return;
      attempt.terminal = true;
      cleanupElement(attempt, ended, error);
      resolve(outcome);
    };
    element.addEventListener("ended", ended);
    element.addEventListener("error", error);
    return attempt;
  }

  #startAttempt(occurrence: ActiveOccurrence, attempt: ElementAttempt, deadlineMs: number, upstreamStartDeadlineMs?: number): void {
    const startDeadlineMs = Math.min(deadlineMs, this.#now() + START_TIMEOUT_MS, upstreamStartDeadlineMs ?? Infinity);
    const startDelay = Math.max(0, startDeadlineMs - this.#now());
    attempt.startTimer = setTimeout(() => attempt.finish("failed"), startDelay);
    let releaseGuard!: () => void;
    const guardCompletion = new Promise<void>((resolve) => { releaseGuard = resolve; });
    const guardTimer = setTimeout(releaseGuard, startDelay);
    attempt.startGuard = guardCompletion;
    void (async () => {
      try {
        await attempt.element.setSinkId(attempt.deviceId);
        if (!this.#isCurrent(occurrence, attempt)) return;
        if (this.#now() >= startDeadlineMs) { attempt.finish("failed"); return; }
        attempt.element.muted = this.#currentMuted;
        const playPromise = attempt.element.play();
        if (!this.#isCurrent(occurrence, attempt)) return;
        await playPromise;
        if (!this.#isCurrent(occurrence, attempt)) return;
        attempt.started = true;
        if (attempt.startTimer !== null) {
          clearTimeout(attempt.startTimer);
          attempt.startTimer = null;
        }
      } catch {
        if (!attempt.terminal) attempt.finish("failed");
      } finally {
        clearTimeout(guardTimer);
        releaseGuard();
      }
    })();
  }

  #isCurrent(occurrence: ActiveOccurrence, attempt: ElementAttempt): boolean {
    return !attempt.terminal && !occurrence.cancelled && occurrence.generation === this.#activeGeneration &&
      this.#active.get(occurrence.key) === occurrence;
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
    let totalBytes = 0;
    for (const asset of request.assets) {
      if (!audioPlayerAssetSchema.safeParse(asset).success || receivedAssetIds.has(asset.assetId) ||
          !referencedAssetIds.has(asset.assetId) || asset.bytes.byteLength > maxAudioTransportAssetBytes) {
        throw new Error("Device audio assets must be bounded, unique, supported and referenced by the batch.");
      }
      receivedAssetIds.add(asset.assetId);
      totalBytes += asset.bytes.byteLength;
    }
    if (totalBytes > maxAudioTransportBatchBytes) throw new Error("Device audio batch bytes exceed the transport limit.");
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
    try { this.#dependencies.revokeSource(source); } catch { /* cleanup is best-effort */ }
  }
}
