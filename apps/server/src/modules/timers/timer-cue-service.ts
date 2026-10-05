import type {
  AssetRepository,
  AudioPlaybackSink,
  Logger,
  OverlayInstruction,
  ResolvedAlertAudio,
  TimerRunState
} from "@stream-jams/core";
import type { AudioOutputService } from "../audio/audio-output-service.js";
import { timerRunOwner, type TimerCueSink } from "./timer-runtime-coordinator.js";

export interface TimerBrowserCueSink {
  play(instruction: OverlayInstruction): void | Promise<void>;
  stop(instructionIds: readonly string[]): void | Promise<void>;
}

import type { LocalMediaService } from "../assets/local-media-service.js";

interface TimerCueServiceOptions {
  readonly localMediaService?: LocalMediaService;
  readonly assets: Pick<AssetRepository, "findById">;
  readonly browser?: TimerBrowserCueSink;
  readonly audioOutputService?: Pick<AudioOutputService, "preparePlayback">;
  readonly audioPlaybackSink?: Pick<AudioPlaybackSink, "play" | "stop">;
  readonly logger?: Pick<Logger, "error">;
  readonly generateReferenceId?: () => string;
}

export class TimerCueService implements TimerCueSink {
  readonly #lifetimes = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();
  readonly #pending = new Map<string, Set<{ cancelled: boolean }>>();
  constructor(private readonly options: TimerCueServiceOptions) {}

  async play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }): Promise<void> {
    const token = { cancelled: false };
    const pending = this.#pending.get(input.run.generation) ?? new Set<{ cancelled: boolean }>();
    pending.add(token);
    this.#pending.set(input.run.generation, pending);
    try { await (this.options.localMediaService === undefined ? this.#play(input, token) : this.options.localMediaService.runPreparation(() => this.#play(input, token))); }
    finally {
      pending.delete(token);
      if (pending.size === 0) this.#pending.delete(input.run.generation);
    }
  }

  async #play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }, token: { cancelled: boolean }): Promise<void> {
    const assetId = input.cue === "start"
      ? input.run.snapshot.startAudioAssetId
      : input.run.snapshot.endAudioAssetId;
    if (assetId === null) return;

    const owner = JSON.stringify(["timers", `cue:${input.run.generation}:${input.cue}`]);
    let asset;
    try {
      if (this.options.localMediaService === undefined) asset = await this.options.assets.findById(assetId);
      else {
        await this.options.localMediaService.acquireFromOwner(owner, timerRunOwner(input.run.generation), [assetId]);
        asset = this.options.localMediaService.get(owner, assetId);
      }
    }
    catch (error) {
      await this.#diagnose("Timer cue asset lookup failed.", input, { assetId }, error);
      return;
    }
    if (token.cancelled) { await this.options.localMediaService?.release(owner); return; }
    if (asset?.mediaType !== "audio" || asset.durationMs === null || asset.durationMs <= 0) {
      await this.#diagnose("Timer cue asset is unavailable or has no playable duration.", input, { assetId });
      await this.options.localMediaService?.release(owner);
      return;
    }

    if (this.options.localMediaService !== undefined) {
      const lifetimes = this.#lifetimes.get(input.run.generation) ?? new Map<string, ReturnType<typeof setTimeout>>();
      const timer = setTimeout(() => {
        lifetimes.delete(owner);
        if (lifetimes.size === 0) this.#lifetimes.delete(input.run.generation);
        void this.options.localMediaService!.release(owner);
      }, Math.min(2147483647, asset.durationMs + 5000));
      timer.unref(); lifetimes.set(owner, timer); this.#lifetimes.set(input.run.generation, lifetimes);
    }
    const instructionId = cueInstructionId(input.run.generation, input.cue);
    const layer = {
      sourceKind: "audio" as const,
      layerId: "timer-cue",
      assetId,
      volume: 1,
      playbackDurationMs: asset.durationMs
    };
    const work: Promise<void>[] = [];
    let browserActive = false;
    if (input.run.snapshot.outputs.browserSource && this.options.browser !== undefined) {
      const instruction: OverlayInstruction = {
        id: instructionId,
        ...(this.options.localMediaService === undefined ? {} : { assetVersions: this.options.localMediaService.versions(owner) }),
        overlayId: "default",
        moduleId: "timers",
        purpose: "live",
        scope: "unified",
        visual: null,
        audio: {
          assetId,
          volume: 1,
          sourceKind: "audio",
          playbackDurationMs: asset.durationMs
        },
        text: null,
        tts: null,
        durationMs: asset.durationMs
      };
      work.push(Promise.resolve().then(() => token.cancelled ? undefined : this.options.browser!.play(instruction)).then(
        () => { browserActive = !token.cancelled; },
        (error: unknown) => this.#diagnose("Timer Browser Source cue playback failed.", input, { assetId, instructionId }, error)
      ));
    }

    const routeIds = [...new Set(input.run.snapshot.outputs.deviceRouteIds)];
    if (routeIds.length > 0) work.push(this.#playDevices(input, asset.durationMs, layer, routeIds, token));
    await Promise.allSettled(work);
    // Device completion/failure is terminal; browser delivery has no completion acknowledgement.
    if (!browserActive) await this.#releaseLifetime(input.run.generation, owner);
  }

  async #releaseLifetime(generation: string, owner: string): Promise<void> {
    const lifetimes = this.#lifetimes.get(generation);
    clearTimeout(lifetimes?.get(owner));
    lifetimes?.delete(owner);
    if (lifetimes?.size === 0) this.#lifetimes.delete(generation);
    await this.options.localMediaService?.release(owner);
  }

  async stop(generation: string): Promise<void> {
    for (const token of this.#pending.get(generation) ?? []) token.cancelled = true;
    const lifetimes = this.#lifetimes.get(generation);
    this.#lifetimes.delete(generation);
    for (const timer of lifetimes?.values() ?? []) clearTimeout(timer);
    await Promise.allSettled([
      ...[...lifetimes?.keys() ?? []].map(owner => this.options.localMediaService?.release(owner)),
      ...(this.options.browser === undefined ? [] : [Promise.resolve().then(() => this.options.browser!.stop([
        cueInstructionId(generation, "start"),
        cueInstructionId(generation, "end")
      ]))]),
      ...(this.options.audioPlaybackSink === undefined ? [] : (this.options.localMediaService === undefined ? [this.options.audioPlaybackSink.stop(generation)] : ["start", "end"].map(cue => this.options.audioPlaybackSink!.stop(JSON.stringify(["timers", `cue:${generation}:${cue}`])))))
    ]);
  }

  async close(): Promise<void> {
    await Promise.all([...new Set([...this.#pending.keys(), ...this.#lifetimes.keys()])].map(generation => this.stop(generation)));
  }

  async #playDevices(
    input: { readonly cue: "start" | "end"; readonly run: TimerRunState },
    durationMs: number,
    layer: ResolvedAlertAudio["layers"][number],
    routeIds: readonly string[],
    token: { cancelled: boolean }
  ): Promise<void> {
    if (this.options.audioOutputService === undefined || this.options.audioPlaybackSink === undefined) {
      await this.#diagnose("Timer device cue output is unavailable.", input, { routeIds });
      return;
    }
    const audio: ResolvedAlertAudio[] = [{
      documentId: `timer:${input.run.definitionId}:${input.cue}`,
      durationMs,
      outputs: { browserSource: false, deviceRouteIds: routeIds },
      layers: [layer]
    }];
    try {
      const prepared = await this.options.audioOutputService.preparePlayback(this.options.localMediaService === undefined ? input.run.generation : JSON.stringify(["timers", `cue:${input.run.generation}:${input.cue}`]), audio);
      if (token.cancelled) return;
      if (prepared.unavailableRouteIds.length > 0) {
        await this.#diagnose("Timer cue audio outputs are unavailable.", input, {
          unavailableRouteIds: prepared.unavailableRouteIds
        });
      }
      if (token.cancelled) return;
      const results = await Promise.allSettled(prepared.batches.map(batch => this.options.audioPlaybackSink!.play({ ...batch, moduleId: "timers" })));
      const failedRouteIds = results.flatMap(result => result.status === "fulfilled" ? result.value.failedRouteIds : []);
      const rejection = results.find(result => result.status === "rejected");
      if (failedRouteIds.length > 0 || rejection?.status === "rejected") {
        await this.#diagnose("Timer cue device playback failed.", input, { failedRouteIds },
          rejection?.status === "rejected" ? rejection.reason : undefined);
      }
    } catch (error) {
      await this.#diagnose("Timer cue device preparation failed.", input, { routeIds }, error);
    }
  }

  async #diagnose(
    message: string,
    input: { readonly cue: "start" | "end"; readonly run: TimerRunState },
    metadata: Record<string, string | readonly string[]>,
    exception?: unknown
  ): Promise<void> {
    if (this.options.logger === undefined) return;
    try {
      const context = {
        module: "timers",
        source: "timers.cue.failed",
        correlationId: this.options.generateReferenceId?.() ?? input.run.generation,
        processingId: input.run.generation,
        metadata: {
          definitionId: input.run.definitionId,
          generation: input.run.generation,
          cue: input.cue,
          nextStep: "Check the saved timer cue asset and selected Audio outputs, then retry the timer.",
          ...metadata
        }
      };
      if (exception === undefined) await this.options.logger.error(message, context);
      else await this.options.logger.error(message, context, exception);
    }
    // error-provenance: allow cleanup -- diagnostic persistence cannot affect the authoritative timer transition
    catch { /* Diagnostics are best-effort and cannot affect timer state. */ }
  }
}

function cueInstructionId(generation: string, cue: "start" | "end"): string {
  return `timer-cue:${generation}:${cue}`;
}
