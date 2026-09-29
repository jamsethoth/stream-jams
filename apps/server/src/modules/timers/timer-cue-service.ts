import type {
  AssetRepository,
  AudioPlaybackSink,
  Logger,
  OverlayInstruction,
  ResolvedAlertAudio,
  TimerRunState
} from "@stream-jams/core";
import type { AudioOutputService } from "../audio/audio-output-service.js";
import type { TimerCueSink } from "./timer-runtime-coordinator.js";

export interface TimerBrowserCueSink {
  play(instruction: OverlayInstruction): void | Promise<void>;
  stop(instructionIds: readonly string[]): void | Promise<void>;
}

interface TimerCueServiceOptions {
  readonly assets: Pick<AssetRepository, "findById">;
  readonly browser?: TimerBrowserCueSink;
  readonly audioOutputService?: Pick<AudioOutputService, "preparePlayback">;
  readonly audioPlaybackSink?: Pick<AudioPlaybackSink, "play" | "stop">;
  readonly logger?: Pick<Logger, "error">;
  readonly generateReferenceId?: () => string;
}

export class TimerCueService implements TimerCueSink {
  constructor(private readonly options: TimerCueServiceOptions) {}

  async play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }): Promise<void> {
    const assetId = input.cue === "start"
      ? input.run.snapshot.startAudioAssetId
      : input.run.snapshot.endAudioAssetId;
    if (assetId === null) return;

    let asset;
    try { asset = await this.options.assets.findById(assetId); }
    catch (error) {
      await this.#diagnose("Timer cue asset lookup failed.", input, { assetId }, error);
      return;
    }
    if (asset?.mediaType !== "audio" || asset.durationMs === null || asset.durationMs <= 0) {
      await this.#diagnose("Timer cue asset is unavailable or has no playable duration.", input, { assetId });
      return;
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
    if (input.run.snapshot.outputs.browserSource && this.options.browser !== undefined) {
      const instruction: OverlayInstruction = {
        id: instructionId,
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
      work.push(Promise.resolve().then(() => this.options.browser!.play(instruction)).then(
        () => undefined,
        error => this.#diagnose("Timer Browser Source cue playback failed.", input, { assetId, instructionId }, error)
      ));
    }

    const routeIds = [...new Set(input.run.snapshot.outputs.deviceRouteIds)];
    if (routeIds.length > 0) work.push(this.#playDevices(input, asset.durationMs, layer, routeIds));
    await Promise.allSettled(work);
  }

  async stop(generation: string): Promise<void> {
    await Promise.allSettled([
      ...(this.options.browser === undefined ? [] : [Promise.resolve().then(() => this.options.browser!.stop([
        cueInstructionId(generation, "start"),
        cueInstructionId(generation, "end")
      ]))]),
      ...(this.options.audioPlaybackSink === undefined ? [] : [this.options.audioPlaybackSink.stop(generation)])
    ]);
  }

  async #playDevices(
    input: { readonly cue: "start" | "end"; readonly run: TimerRunState },
    durationMs: number,
    layer: ResolvedAlertAudio["layers"][number],
    routeIds: readonly string[]
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
      const prepared = await this.options.audioOutputService.preparePlayback(input.run.generation, audio);
      if (prepared.unavailableRouteIds.length > 0) {
        await this.#diagnose("Timer cue audio outputs are unavailable.", input, {
          unavailableRouteIds: prepared.unavailableRouteIds
        });
      }
      const results = await Promise.allSettled(prepared.batches.map(batch => this.options.audioPlaybackSink!.play(batch)));
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
    } catch { /* Diagnostics are best-effort and cannot affect timer state. */ }
  }
}

function cueInstructionId(generation: string, cue: "start" | "end"): string {
  return `timer-cue:${generation}:${cue}`;
}
