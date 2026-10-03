import type {
  AlertMatcher,
  AlertMatch,
  AlertEditorDocument,
  AlertResolver,
  AlertResolverTarget,
  AlertService,
  AlertVariant,
  AssetRepository,
  AssetRecord,
  NormalizedStreamEvent,
  PlaybackCooldownService,
  PlaybackDedupeService,
  PlaybackQueue,
  PlaybackQueueSnapshot,
  PlaybackSafetyState,
  ResolvedAlert,
  OverlayInstruction,
  EnqueuePlaybackItemInput,
  Logger,
  TtsService
} from "@stream-jams/core";
import { collectAlertDurationAssetIds, PlaybackQueueItemNotFoundError, resolveAlertAudio, resolveMediaDuration } from "@stream-jams/core";
import type { AudioPlaybackSink, DeviceAudioBatch, DeviceAudioResult, PlaybackQueueItem } from "@stream-jams/core";
import type { AudioOutputService } from "../audio/audio-output-service.js";
import { effectOccurrenceKey } from "../screen-effects/effect-playback-coordinator.js";
import type { LocalMediaService } from "../assets/local-media-service.js";

type PlaybackAudioOutputService = Pick<AudioOutputService, "preparePlayback"> & Partial<Pick<AudioOutputService, "listRoutes">>;

export type PlaybackEnqueueStatus = "queued" | "duplicate" | "no-matches" | "cooldown";

export interface PlaybackEnqueueResult {
  readonly status: PlaybackEnqueueStatus;
  readonly snapshot: PlaybackQueueSnapshot;
  readonly matchedRuleIds: readonly string[];
  readonly enqueuedAlertIds: readonly string[];
}

function dedupeTargets(targets: readonly AlertResolverTarget[]): readonly AlertResolverTarget[] {
  const deduped: AlertResolverTarget[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const key = [target.overlayId, target.purpose, target.scope, target.moduleId ?? "alerts", target.targetProfileId ?? "legacy"].join(":");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(target);
  }

  return deduped;
}

export interface OverlayPlaybackInstructionSink {
  preparePlaybackInstruction?(instruction: OverlayInstruction): Promise<{ readonly deliveredClientIds: readonly string[]; start(startsAtEpochMs: number): void }>;
  deliverPlaybackInstruction(instruction: OverlayInstruction): { readonly deliveredClientIds: readonly string[] } | void;
  setPlaybackMuted?(muted: boolean): void;
  stopPlaybackInstructions?(instructionIds: readonly string[]): void;
}

export interface DesktopVisualPlaybackSink {
  prepare?(occurrenceId: string, instructions: readonly OverlayInstruction[]): Promise<{ start(startsAtEpochMs: number): Promise<void> }>;
  play(occurrenceId: string, instructions: readonly OverlayInstruction[], startsAtEpochMs: number): Promise<void>;
  stop(occurrenceId: string): Promise<void>;
  close(): Promise<void>;
}

export interface PlaybackCoordinatorDependencies {
  readonly localMediaService?: LocalMediaService;
  readonly alertService: Pick<AlertService, "listActiveRules">;
  readonly matcher: AlertMatcher;
  readonly resolver: AlertResolver;
  readonly queue: PlaybackQueue;
  readonly cooldownService: PlaybackCooldownService;
  readonly dedupeService: PlaybackDedupeService;
  readonly defaultTarget: AlertResolverTarget;
  readonly additionalTargets?: readonly AlertResolverTarget[];
  readonly visualAssetMediaTypes?: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly assetRepository?: Pick<AssetRepository, "findManyByIds">;
  readonly assetDurationCatalog?: { getMany(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> };
  readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink;
  readonly audioPlaybackSink?: AudioPlaybackSink;
  readonly desktopVisualSink?: DesktopVisualPlaybackSink;
  readonly audioOutputService?: PlaybackAudioOutputService;
  readonly findEditorDocuments?: (alertIds: readonly string[]) => Promise<ReadonlyMap<string, AlertEditorDocument>>;
  readonly ttsService?: Pick<TtsService, "createPlaybackInstructionFromModeratedText">;
  readonly logger?: Pick<Logger, "error">;
  readonly generateReferenceId?: () => string;
  readonly persistPlaybackSafetyState?: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
}

interface DevicePlaybackState {
  readonly occurrenceId: string;
  readonly transportId: string;
  cancelled: boolean;
  settled: boolean;
  stopping: Promise<void> | null;
}

interface PendingBrowserInstruction {
  pendingClients: Set<string> | null;
  readonly completedBeforeDispatch: Set<string>;
  dispatchComplete: boolean;
}

const PLAYBACK_PREPARATION_TIMEOUT_MS = 15_000;
const PLAYBACK_COMPLETION_GRACE_MS = 5_000;

export class PlaybackCoordinator {
  readonly #alertService: Pick<AlertService, "listActiveRules">;
  readonly #matcher: AlertMatcher;
  readonly #resolver: AlertResolver;
  readonly #queue: PlaybackQueue;
  readonly #cooldownService: PlaybackCooldownService;
  readonly #dedupeService: PlaybackDedupeService;
  readonly #targets: readonly AlertResolverTarget[];
  readonly #visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly #assetRepository: Pick<AssetRepository, "findManyByIds"> | null;
  readonly #assetDurationCatalog: PlaybackCoordinatorDependencies["assetDurationCatalog"] | null;
  readonly #overlayPlaybackSink: OverlayPlaybackInstructionSink | null;
  readonly #audioPlaybackSink: AudioPlaybackSink | null;
  readonly #desktopVisualSink: DesktopVisualPlaybackSink | null;
  #desktopPlayback: DevicePlaybackState | null = null;
  readonly #audioOutputService: PlaybackAudioOutputService | null;
  #devicePlayback: DevicePlaybackState | null = null;
  #closePromise: Promise<void> | null = null;
  #preparationCancels = new Set<() => void>();
  #completionTimer: ReturnType<typeof setTimeout> | null = null;
  #stoppingOccurrence: { readonly id: string; readonly promise: Promise<PlaybackQueueSnapshot> } | null = null;
  readonly #findEditorDocuments:
    ((alertIds: readonly string[]) => Promise<ReadonlyMap<string, AlertEditorDocument>>) | null;
  readonly #ttsService: Pick<TtsService, "createPlaybackInstructionFromModeratedText"> | null;
  readonly #logger: Pick<Logger, "error"> | null;
  readonly #generateReferenceId: (() => string) | null;
  readonly #persistPlaybackSafetyState: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
  #lastDeliveredCurrentItemId: string | null = null;
  #lastRemoteTtsItemId: string | null = null;
  #pendingClientsByInstructionId = new Map<string, PendingBrowserInstruction>();
  #browserInstructionIds: readonly string[] = [];
  #browserDispatchComplete = true;
  #closed = false;
  readonly #replayDocuments = new Map<string, readonly AlertEditorDocument[]>();
  readonly #localMediaService: LocalMediaService | undefined;

  constructor(dependencies: PlaybackCoordinatorDependencies) {
    this.#localMediaService = dependencies.localMediaService;
    this.#alertService = dependencies.alertService;
    this.#matcher = dependencies.matcher;
    this.#resolver = dependencies.resolver;
    this.#queue = dependencies.queue;
    this.#cooldownService = dependencies.cooldownService;
    this.#dedupeService = dependencies.dedupeService;
    this.#targets = dedupeTargets([dependencies.defaultTarget, ...(dependencies.additionalTargets ?? [])]);
    this.#visualAssetMediaTypes = dependencies.visualAssetMediaTypes ?? {};
    this.#assetRepository = dependencies.assetRepository ?? null;
    this.#assetDurationCatalog = dependencies.assetDurationCatalog ?? null;
    this.#overlayPlaybackSink = dependencies.overlayPlaybackSink ?? null;
    this.#audioPlaybackSink = dependencies.audioPlaybackSink ?? null;
    this.#desktopVisualSink = dependencies.desktopVisualSink ?? null;
    this.#audioOutputService = dependencies.audioOutputService ?? null;
    this.#findEditorDocuments = dependencies.findEditorDocuments ?? null;
    this.#ttsService = dependencies.ttsService ?? null;
    this.#logger = dependencies.logger ?? null;
    this.#generateReferenceId = dependencies.generateReferenceId ?? null;
    this.#persistPlaybackSafetyState = dependencies.persistPlaybackSafetyState ?? (async (patch) => {
      const snapshot = this.#queue.getSnapshot();
      return {
        paused: patch.paused ?? snapshot.paused,
        muted: patch.muted ?? snapshot.muted,
        doNotDisturb: patch.doNotDisturb ?? snapshot.doNotDisturb
      };
    });
  }

  getSnapshot(): PlaybackQueueSnapshot {
    return this.#queue.getSnapshot();
  }

  close(): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    if (this.#devicePlayback !== null) this.#devicePlayback.cancelled = true;
    if (this.#desktopPlayback !== null) this.#desktopPlayback.cancelled = true;
    this.#clearOccurrenceTimers();
    this.#queue.pause();
    this.#queue.clearPending();
    this.#pendingClientsByInstructionId.clear();
    const ids = this.#browserInstructionIds;
    this.#stopBrowserInstructions(ids);
    this.#closePromise = Promise.allSettled([this.#audioPlaybackSink?.close(), this.#desktopVisualSink?.close(),
      ...(this.#localMediaService === undefined || this.#queue.getSnapshot().current === null ? [] : [this.#localMediaService.release(effectOccurrenceKey("alerts", this.#queue.getSnapshot().current!.id))])
    ]).then(results => {
      const failures = results.filter(result => result.status === "rejected").map(result => result.reason as unknown);
      if (failures.length > 0) throw new AggregateError(failures, "Playback output cleanup failed");
    });
    return this.#closePromise;
  }

  async enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> {
    return this.#localMediaService === undefined ? this.#enqueueEvent(event) : this.#localMediaService.runAdmission(() => this.#enqueueEvent(event));
  }

  async #enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> {
    if (this.#closed) throw new Error("Playback has stopped.");
    if (!this.#dedupeService.accept(event)) {
      return this.#result("duplicate", [], []);
    }

    const rules = await this.#alertService.listActiveRules({ eventType: event.type });
    const matches = this.#matcher.findMatches({
      event,
      rules
    });
    if (matches.length === 0) {
      return this.#result("no-matches", [], []);
    }

    const cooldownSubjects = matches.map((match) => ({
      match,
      ruleId: match.rule.id,
      eventType: match.event.type,
      cooldownSeconds: match.rule.cooldownSeconds
    }));
    const readySubjects = this.#cooldownService.filterReady(cooldownSubjects);
    const readyMatches = readySubjects.map((subject) => subject.match);
    if (readyMatches.length === 0) {
      return this.#result("cooldown", matches.map((match) => match.rule.id), []);
    }

    const selectedVariants = this.#resolver.selectVariants(readyMatches);
    const editorDocuments = await this.#loadEditorDocuments(readyMatches, selectedVariants);
    if (this.#localMediaService !== undefined) {
      const assetIds = [...selectedVariants.values()].flatMap(variant => [variant.visualAssetId, variant.audioAssetId]).filter((id): id is string => id !== null);
      assetIds.push(...[...editorDocuments.values()].flatMap(document => document.layers.flatMap(layer => layer.type === "image" || layer.type === "video" || layer.type === "audio" ? [layer.assetId] : layer.type === "text" && layer.textStyle.fontAssetId ? [layer.textStyle.fontAssetId] : [])));
      const records = await this.#localMediaService.captureAdmission(assetIds);
      for (const document of editorDocuments.values()) {
        for (const layer of document.layers) {
          if (layer.type === "text" && layer.textStyle.fontAssetId && records.get(layer.textStyle.fontAssetId)?.mediaType !== "font") {
            throw new Error("Selected alert font asset is missing or incompatible.");
          }
        }
      }
    }
    const { documents: resolvedEditorDocuments, assetDurations } = await this.#resolveEditorDurations(editorDocuments);
    const visualAssetMediaTypes = await this.#resolveVisualAssetMediaTypes(
      selectedVariants.values(),
      resolvedEditorDocuments.values()
    );
    const audio = readyMatches.flatMap(match => {
      const selected = selectedVariants.get(match.rule.id)!;
      const documentId = selected.id === match.rule.variants[0]?.id ? match.rule.id : selected.id;
      const document = resolvedEditorDocuments.get(documentId);
      if (document === undefined || !document.enabled) return [];
      const resolved = resolveAlertAudio(document, visualAssetMediaTypes, assetDurations);
      return resolved === null || resolved.outputs.deviceRouteIds.length === 0 ? [] : [resolved];
    });
    if (this.#closed) throw new Error("Playback has stopped.");
    const resolvedAlerts = this.#targets.flatMap((target) =>
      this.#resolver.resolveMatches({
        matches: readyMatches,
        target,
        visualAssetMediaTypes,
        editorDocuments: resolvedEditorDocuments,
        selectedVariants,
        assetDurations
      })
    );
    const snapshot = this.enqueueResolvedTest({
      sourceEvent: event,
      replayDocuments: [...editorDocuments.values()],
      alerts: resolvedAlerts,
      audio,
      priority: Math.max(...readyMatches.map((match) => match.rule.priority))
    });

    for (const subject of readySubjects) {
      this.#cooldownService.recordPlayback(subject);
    }

    return {
      status: "queued",
      snapshot,
      matchedRuleIds: readyMatches.map((match) => match.rule.id),
      enqueuedAlertIds: resolvedAlerts.map((alert: ResolvedAlert) => alert.id)
    };
  }

  async #resolveEditorDurations(
    documents: ReadonlyMap<string, AlertEditorDocument>
  ): Promise<{
    readonly documents: ReadonlyMap<string, AlertEditorDocument>;
    readonly assetDurations: Readonly<Record<string, number | null>>;
  }> {
    if (this.#assetDurationCatalog == null) return { documents, assetDurations: {} };
    const ids = [...new Set([...documents.values()].flatMap(collectAlertDurationAssetIds))];
    const records = this.#localMediaService === undefined ? await this.#assetDurationCatalog.getMany(ids) : await this.#localMediaService.captureAdmission(ids);
    const assetDurations = Object.fromEntries(ids.map((assetId) => [assetId, records.get(assetId)?.durationMs ?? null]));
    const resolvedDocuments = new Map([...documents].map(([id, document]) => {
      const candidates = collectAlertDurationAssetIds(document).flatMap((assetId) => {
        const record = records.get(assetId);
        return record === undefined ? [] : [{
          assetId,
          label: record.originalFileName,
          mediaType: record.mediaType,
          durationMs: record.durationMs,
          eligible: true
        }];
      });
      const resolution = resolveMediaDuration({
        mode: document.durationMode ?? "custom",
        customDurationMs: document.durationMs,
        fallbackDurationMs: 5_000,
        maximumDurationMs: 120_000,
        candidates
      });
      return [id, { ...document, durationMs: resolution.durationMs }] as const;
    }));
    return { documents: resolvedDocuments, assetDurations };
  }

  async #dispatchRemoteTts(alerts: readonly ResolvedAlert[]): Promise<void> {
    const dispatched = new Set<string>();
    const layerAwareDispatches = new Set(
      alerts.flatMap((alert) => {
        const tts = alert.overlayInstruction.tts;
        if (tts === null || tts.mode !== "remote-trigger") return [];
        const providerId = readProviderPayloadString(tts.providerPayload, "providerId");
        const layerId = readProviderPayloadString(tts.providerPayload, "layerId");
        return providerId === null || layerId === null
          ? []
          : [remoteTtsBaseKey(alert, providerId, tts.text)];
      })
    );
    for (const alert of alerts) {
      if (this.#closed) return;
      const tts = alert.overlayInstruction.tts;
      if (tts?.mode !== "remote-trigger") continue;
      const providerId = readProviderPayloadString(tts.providerPayload, "providerId");
      if (providerId === null) continue;
      const layerId = readProviderPayloadString(tts.providerPayload, "layerId");
      const baseKey = remoteTtsBaseKey(alert, providerId, tts.text);
      if (layerId === null && layerAwareDispatches.has(baseKey)) continue;
      const key = `${baseKey}:${layerId ?? "legacy"}`;
      if (dispatched.has(key)) continue;
      dispatched.add(key);

      if (this.#ttsService === null) {
        await this.#recordRemoteTtsFailure(providerId, alert);
        continue;
      }
      try {
        await this.#ttsService.createPlaybackInstructionFromModeratedText({
          providerId,
          text: tts.text,
          metadata: {
            sourceEventId: alert.sourceEventId,
            ruleId: alert.ruleId,
            variantId: alert.variantId,
            ...(layerId === null ? {} : { layerId })
          }
        });
      } catch (error) {
        await this.#recordRemoteTtsFailure(providerId, alert, error);
      }
    }
  }

  async #recordRemoteTtsFailure(providerId: string, alert: ResolvedAlert, exception?: unknown): Promise<void> {
    if (this.#logger === null || this.#generateReferenceId === null) return;
    const referenceId = this.#generateReferenceId();
    await this.#logger.error(
        "Speaker.bot TTS playback failed. Visual and audio alert playback continued.",
        {
          module: "tts",
          source: "tts.remote-trigger.failed",
          correlationId: referenceId,
          processingId: null,
          metadata: {
            providerId,
            sourceEventId: alert.sourceEventId,
            ruleId: alert.ruleId
          }
        },
        exception
      );
  }

  enqueueResolvedTest(input: EnqueuePlaybackItemInput & { readonly replayDocuments?: readonly AlertEditorDocument[] }): PlaybackQueueSnapshot {
    if (this.#closed) throw new Error("Playback has stopped.");
    if (this.#localMediaService === undefined) return this.#deliverCurrent(this.#queue.enqueue(input));
    if (!this.#localMediaService.admissionActive()) throw new Error("Playback media admission was not captured.");
    const before = this.#queue.getSnapshot();
    const existing = new Set([before.current?.id, ...before.queued.map(item => item.id)]);
    const assetVersions = this.#localMediaService.admissionVersions();
    const snapshot = this.#queue.enqueue({ ...input, alerts: input.alerts.map(alert => ({ ...alert, overlayInstruction: { ...alert.overlayInstruction, assetVersions } })) });
    const admitted = [snapshot.current, ...snapshot.queued].find(item => item !== null && !existing.has(item.id));
    if (admitted !== undefined && admitted !== null) {
      this.#localMediaService.commitAdmission(effectOccurrenceKey("alerts", admitted.id));
      this.#replayDocuments.set(admitted.id, structuredClone(input.replayDocuments ?? []));
    }
    return this.#deliverCurrent(snapshot);
  }

  completeCurrent(): PlaybackQueueSnapshot {
    if (this.#closed || !this.#browserDispatchComplete || (this.#desktopPlayback !== null && (!this.#desktopPlayback.settled || this.#desktopPlayback.cancelled)) || (this.#devicePlayback !== null && (!this.#devicePlayback.settled || this.#devicePlayback.cancelled))) {
      return this.#queue.getSnapshot();
    }
    this.#clearOccurrenceTimers();
    return this.#deliverCurrent(this.#queue.completeCurrent());
  }

  reportInstructionFinished(clientId: string, instructionId: string): PlaybackQueueSnapshot {
    const snapshot = this.#queue.getSnapshot();
    const pending = this.#pendingClientsByInstructionId.get(instructionId);
    if (snapshot.current?.id !== this.#lastDeliveredCurrentItemId || pending === undefined) {
      return snapshot;
    }

    if (!pending.dispatchComplete) {
      pending.completedBeforeDispatch.add(clientId);
      return snapshot;
    }
    if (pending.pendingClients !== null && !pending.pendingClients.delete(clientId)) {
      return snapshot;
    }
    if (pending.pendingClients === null || pending.pendingClients.size === 0) {
      this.#pendingClientsByInstructionId.delete(instructionId);
    }
    return this.#canCompleteCurrent() ? this.completeCurrent() : snapshot;
  }

  reportClientDisconnected(clientId: string): PlaybackQueueSnapshot {
    const snapshot = this.#queue.getSnapshot();
    if (snapshot.current?.id !== this.#lastDeliveredCurrentItemId) {
      return snapshot;
    }

    let removed = false;
    for (const [instructionId, pending] of this.#pendingClientsByInstructionId) {
      if (!pending.dispatchComplete) {
        pending.completedBeforeDispatch.add(clientId);
      } else if (pending.pendingClients !== null && pending.pendingClients.delete(clientId)) {
        removed = true;
        if (pending.pendingClients.size === 0) {
          this.#pendingClientsByInstructionId.delete(instructionId);
        }
      }
    }
    return removed && this.#canCompleteCurrent() ? this.completeCurrent() : snapshot;
  }

  skipCurrent(): Promise<PlaybackQueueSnapshot> {
    const current = this.#queue.getSnapshot().current;
    if (this.#closed || current === null) return Promise.resolve(this.#queue.getSnapshot());
    return this.#stopOccurrenceAndAdvance(current.id, "skipped");
  }

  async skip(occurrenceId: string): Promise<boolean> {
    if (this.#queue.getSnapshot().current?.id !== occurrenceId) return false;
    await this.#stopOccurrenceAndAdvance(occurrenceId, "skipped");
    return true;
  }

  remove(occurrenceId: string): boolean {
    return this.#queue.remove(occurrenceId);
  }

  clearPending(): number {
    return this.#queue.clearPending();
  }

  setModulePaused(paused: boolean): PlaybackQueueSnapshot {
    return this.#deliverCurrent(this.#queue.setModulePaused(paused));
  }

  async applySafetyState(state: PlaybackSafetyState): Promise<PlaybackQueueSnapshot> {
    const snapshot = this.#deliverCurrent(this.#queue.setSafetyState(state));
    try {
      this.#overlayPlaybackSink?.setPlaybackMuted?.(snapshot.muted);
    } catch (error) {
      void this.#recordOverlayTransportFailure(
        "Browser overlay mute state could not be updated.",
        "overlay.playback.mute-failed",
        error
      );
      // A browser transport failure must not prevent device mute from being applied.
    }
    await Promise.allSettled([
      this.#audioPlaybackSink?.setMuted(snapshot.muted)
    ]);
    return snapshot;
  }

  replayRecent(itemId: string): PlaybackQueueSnapshot | Promise<PlaybackQueueSnapshot> {
    if (this.#localMediaService === undefined) return this.#deliverCurrent(this.#queue.replayRecent(itemId));
    const item = this.#queue.getSnapshot().recent.find(candidate => candidate.id === itemId);
    if (item === undefined) throw new PlaybackQueueItemNotFoundError(itemId);
    return this.#localMediaService.runAdmission(async () => {
      const authored = this.#replayDocuments.get(itemId) ?? [];
      const ids = [...new Set([
        ...item.alerts.flatMap(alert => [alert.overlayInstruction.visual?.assetId, alert.overlayInstruction.audio?.assetId, alert.overlayInstruction.tts?.audioAssetId, alert.overlayInstruction.text?.textStyle?.fontAssetId].filter((id): id is string => id != null)),
        ...item.audio.flatMap(audio => audio.layers.map(layer => layer.assetId)),
        ...authored.flatMap(collectAlertDurationAssetIds)
      ])];
      const records = await this.#localMediaService!.captureAdmission(ids);
      const durations = new Map(authored.map(document => [document.id, resolveMediaDuration({
        mode: document.durationMode ?? "custom", customDurationMs: document.durationMs, fallbackDurationMs: 5000, maximumDurationMs: 120000,
        candidates: collectAlertDurationAssetIds(document).map(id => { const record = records.get(id)!; return { assetId: id, label: record.originalFileName, mediaType: record.mediaType, durationMs: record.durationMs, eligible: true }; })
      }).durationMs]));
      const alerts = item.alerts.map(alert => {
        const document = authored.find(candidate => candidate.id === alert.variantId || candidate.id === alert.ruleId);
        const instruction = alert.overlayInstruction;
        const baseDuration = document === undefined ? instruction.durationMs : durations.get(document.id)!;
        const extension = document?.durationMode === "media" && instruction.audio === null && instruction.tts === null && instruction.animation?.exit !== undefined && instruction.animation.exit !== "none" ? instruction.animation.durationMs : 0;
        const durationMs = Math.min(120000, baseDuration + extension);
        return { ...alert, overlayInstruction: { ...instruction, durationMs, timing: undefined,
          audio: instruction.audio === null ? null : { ...instruction.audio, playbackDurationMs: Math.min(records.get(instruction.audio.assetId)?.durationMs ?? baseDuration, baseDuration) } } };
      });
      const audio = item.audio.map(value => {
        const durationMs = durations.get(value.documentId) ?? value.durationMs;
        return { ...value, durationMs, layers: value.layers.map(layer => ({ ...layer, playbackDurationMs: Math.min(records.get(layer.assetId)?.durationMs ?? durationMs, durationMs) })) };
      });
      return this.enqueueResolvedTest({ sourceEvent: item.sourceEvent, alerts, audio, priority: item.priority, replayDocuments: authored });
    });
  }

  async pause(): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ paused: true });
    return this.#queue.pause();
  }

  async resume(): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ paused: false });
    return this.#deliverCurrent(this.#queue.resume());
  }

  async mute(): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ muted: true });
    const snapshot = this.#queue.mute();
    this.#overlayPlaybackSink?.setPlaybackMuted?.(snapshot.muted);
    await this.#audioPlaybackSink?.setMuted(snapshot.muted);
    return snapshot;
  }

  async unmute(): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ muted: false });
    const snapshot = this.#queue.unmute();
    this.#overlayPlaybackSink?.setPlaybackMuted?.(snapshot.muted);
    await this.#audioPlaybackSink?.setMuted(snapshot.muted);
    return snapshot;
  }

  async setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ doNotDisturb: enabled });
    return this.#deliverCurrent(this.#queue.setDoNotDisturb(enabled));
  }

  #deliverCurrent(initialSnapshot: PlaybackQueueSnapshot): PlaybackQueueSnapshot {
    const retained = new Set([initialSnapshot.current?.id, ...initialSnapshot.queued.map(item => item.id), ...initialSnapshot.recent.map(item => item.id)]);
    for (const id of this.#replayDocuments.keys()) if (!retained.has(id)) this.#replayDocuments.delete(id);
    return this.#localMediaService === undefined ? this.#deliverGroup(initialSnapshot) : this.#localMediaService.runPreparation(() => this.#deliverGroup(initialSnapshot));
  }

  #deliverGroup(initialSnapshot: PlaybackQueueSnapshot): PlaybackQueueSnapshot {
    if (this.#closed) return initialSnapshot;
    let snapshot = initialSnapshot;
    while (true) {
      if (snapshot.current === null) {
        this.#clearOccurrenceTimers();
        this.#devicePlayback = null;
        this.#desktopPlayback = null;
        this.#lastDeliveredCurrentItemId = null;
        this.#lastRemoteTtsItemId = null;
        this.#pendingClientsByInstructionId.clear();
        this.#browserInstructionIds = [];
        this.#browserDispatchComplete = true;
        return snapshot;
      }

      const shouldDispatchRemoteTts = snapshot.current.id !== this.#lastRemoteTtsItemId;
      if (shouldDispatchRemoteTts) {
        this.#lastRemoteTtsItemId = snapshot.current.id;
      }

      if (this.#overlayPlaybackSink === null && this.#audioPlaybackSink === null && this.#desktopVisualSink === null) {
        if (shouldDispatchRemoteTts && !snapshot.muted) {
          void this.#dispatchRemoteTts(snapshot.current.alerts).catch(
          // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
          () => undefined);
        }
        return snapshot;
      }

      if (snapshot.current.id === this.#lastDeliveredCurrentItemId) {
        if (shouldDispatchRemoteTts && !snapshot.muted) {
          void this.#dispatchRemoteTts(snapshot.current.alerts).catch(
          // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
          () => undefined);
        }
        return snapshot;
      }

      this.#lastDeliveredCurrentItemId = snapshot.current.id;
      this.#clearOccurrenceTimers();
      this.#pendingClientsByInstructionId.clear();
      this.#browserDispatchComplete = false;
      this.#devicePlayback = null;
      this.#desktopPlayback = null;
      const transportId = effectOccurrenceKey("alerts", snapshot.current.id);
      const desktopInstructions = snapshot.current.alerts.filter(alert => alert.desktopVisualEligible === true).map(alert => alert.overlayInstruction).filter(instruction =>
        instruction.moduleId === "alerts" && instruction.scope === "module" && instruction.targetProfileId === "landscape" &&
        (instruction.visual !== null || instruction.text !== null || instruction.shape != null));
      if (this.#desktopVisualSink !== null && desktopInstructions.length > 0) {
        this.#desktopPlayback = {
          occurrenceId: snapshot.current.id,
          transportId,
          cancelled: false,
          settled: false,
          stopping: null
        };
      }
      const browserInstructions = (this.#overlayPlaybackSink === null ? [] : snapshot.current.alerts).map(alert => ({
        ...alert.overlayInstruction,
        id: `${snapshot.current!.id}:${alert.overlayInstruction.id}`
      }));
      this.#browserInstructionIds = browserInstructions.map(instruction => instruction.id);
      for (const instruction of browserInstructions) {
        this.#pendingClientsByInstructionId.set(instruction.id, {
          pendingClients: null,
          completedBeforeDispatch: new Set(),
          dispatchComplete: false
        });
      }
      // Register device and browser work before either sink can report completion.
      if (snapshot.current.audio.length > 0 && this.#audioPlaybackSink !== null && this.#audioOutputService !== null) {
        const state = {
          occurrenceId: snapshot.current.id,
          transportId,
          cancelled: false,
          settled: false,
          stopping: null
        };
        this.#devicePlayback = state;

      }
      const occurrenceDurationMs = Math.max(
        0,
        ...snapshot.current.alerts.map(alert => alert.overlayInstruction.durationMs),
        ...snapshot.current.audio.map(audio => audio.durationMs)
      );
      const item = snapshot.current;
      const device = this.#devicePlayback;
      const desktop = this.#desktopPlayback;
      const active = () => !this.#closed && this.#queue.getSnapshot().current?.id === item.id && this.#stoppingOccurrence?.id !== item.id;
      const starters: Array<(at: number) => void> = [];
      const preparation: Promise<void>[] = [];
      for (const instruction of browserInstructions) {
        const dispatch = (at: number, prepared?: { readonly deliveredClientIds: readonly string[]; start(at: number): void }) => {
          const pending = this.#pendingClientsByInstructionId.get(instruction.id);
          if (pending === undefined) return;
          try {
            const delivery = prepared === undefined
              ? this.#overlayPlaybackSink!.deliverPlaybackInstruction({ ...instruction, timing: { startsAtEpochMs: at, endsAtEpochMs: at + instruction.durationMs } })
              : (prepared.start(at), prepared);
            pending.dispatchComplete = true;
            if (delivery === undefined) {
              if (pending.completedBeforeDispatch.size > 0) this.#pendingClientsByInstructionId.delete(instruction.id);
            } else {
              pending.pendingClients = new Set(delivery.deliveredClientIds);
              for (const clientId of pending.completedBeforeDispatch) pending.pendingClients.delete(clientId);
              if (pending.pendingClients.size === 0) this.#pendingClientsByInstructionId.delete(instruction.id);
            }
          } catch (error) { browserFailed(error); }
        };
        const browserFailed = (error: unknown) => {
          this.#pendingClientsByInstructionId.delete(instruction.id);
          this.#stopBrowserInstructions([instruction.id]);
          void this.#recordOverlayTransportFailure("Browser overlay playback instruction could not be delivered.", "overlay.playback.delivery-failed", error, item.id, instruction.id);
        };
        if (this.#overlayPlaybackSink?.preparePlaybackInstruction === undefined) starters.push(at => dispatch(at));
        else preparation.push(this.#prepareRecipient(
          () => this.#overlayPlaybackSink!.preparePlaybackInstruction!(instruction), browserFailed
        ).then(prepared => { if (prepared !== null) starters.push(at => dispatch(at, prepared)); }));
      }
      if (desktop !== null) {
        if (this.#desktopVisualSink!.prepare === undefined) starters.push(at => { void this.#dispatchDesktop(desktopInstructions, at, desktop); });
        else preparation.push(this.#prepareRecipient(
          () => this.#desktopVisualSink!.prepare!(desktop.transportId, desktopInstructions),
          async error => {
            desktop.settled = true;
            this.#recordDesktopFailure(error, desktop);
            await this.#desktopVisualSink!.stop(desktop.transportId);
          }
        ).then(prepared => { if (prepared !== null) starters.push(at => { void this.#dispatchDesktop(desktopInstructions, at, desktop, prepared.start); }); }));
      }
      if (device !== null) preparation.push(this.#prepareRecipient(async () => {
        const selected = await this.#audioOutputService!.preparePlayback(device.transportId, item.audio);
        if (!active() || device.cancelled) return [];
        if (selected.unavailableRouteIds.length > 0) void this.#recordDeviceAudioFailure(item.id, selected.unavailableRouteIds);
        const batches = await Promise.all(selected.batches.map(async batch => {
          try {
            const prepared = await this.#audioPlaybackSink!.prepare?.({ ...batch, muted: this.#queue.getSnapshot().muted });
            return { batch, prepared };
          } catch (error) {
            void this.#recordDeviceAudioFailure(item.id, batch.destinations.flatMap(destination => destination.routeIds), error);
            return null;
          }
        }));
        return batches.filter(batch => batch !== null);
      }, async error => {
        device.cancelled = true;
        void this.#recordDeviceAudioFailure(item.id, item.audio.flatMap(audio => audio.outputs.deviceRouteIds), error);
        device.stopping ??= this.#audioPlaybackSink!.stop(device.transportId);
        await device.stopping;
        if (this.#devicePlayback === device) this.#devicePlayback = null;
      }).then(batches => { if (batches !== null) starters.push(at => { void this.#dispatchDeviceAudio(item, device, at, batches); }); }));
      const commit = () => {
        if (!active()) return;
        const startsAtEpochMs = Date.now() + 100;
        this.#completionTimer = this.#scheduleTimer(() => { void this.#handleWatchdog(item.id); }, startsAtEpochMs - Date.now() + occurrenceDurationMs + PLAYBACK_COMPLETION_GRACE_MS);
        for (const start of starters) start(startsAtEpochMs);
        this.#browserDispatchComplete = true;
        if (shouldDispatchRemoteTts && !this.#queue.getSnapshot().muted) {
          void this.#dispatchRemoteTts(item.alerts).catch(
          // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
          () => undefined);
        }
      };
      if (preparation.length > 0) {
        void Promise.allSettled(preparation).then(() => {
          commit();
          if (active() && this.#canCompleteCurrent()) this.completeCurrent();
        });
        return snapshot;
      }
      commit();

      if (!this.#canCompleteCurrent()) {
        return snapshot;
      }
      this.#clearOccurrenceTimers();
      snapshot = this.#queue.completeCurrent();
    }
  }

  async #dispatchDeviceAudio(item: PlaybackQueueItem, state: DevicePlaybackState, startsAtEpochMs: number, batches: readonly { batch: DeviceAudioBatch; prepared: { start(at: number): Promise<DeviceAudioResult> } | undefined }[]): Promise<void> {
    const active = () => !this.#closed && !state.cancelled && this.#devicePlayback === state;
    try {
      if (!active()) return;
      // All documents belong to one occurrence. One failed document must not
      // release the queue while other documents are still playing.
      let requiresExplicitStop = false;
      await Promise.allSettled(batches.map(async ({ batch, prepared }) => {
        if (!active()) return;
        try {
          const result = await (prepared === undefined ? this.#audioPlaybackSink!.play({ ...batch, timing: { startsAtEpochMs, endsAtEpochMs: startsAtEpochMs + batch.durationMs }, muted: this.#queue.getSnapshot().muted }) : prepared.start(startsAtEpochMs));
          if (result.failedRouteIds.length > 0) void this.#recordDeviceAudioFailure(item.id, result.failedRouteIds);
        } catch (error) {
          requiresExplicitStop = true;
          void this.#recordDeviceAudioFailure(item.id, batch.destinations.flatMap(destination => destination.routeIds), error);
        }
      }));
      if (requiresExplicitStop && active()) {
        try {
          state.stopping ??= this.#audioPlaybackSink!.stop(state.transportId);
          await state.stopping;
        } catch (error) {
          state.stopping = null;
          state.cancelled = true;
          this.#clearOccurrenceTimers();
          void this.#recordDeviceAudioFailure(item.id, item.audio.flatMap(audio => audio.outputs.deviceRouteIds), error);
          return;
        }
      }
    } catch (error) {
      void this.#recordDeviceAudioFailure(item.id, item.audio.flatMap(audio => audio.outputs.deviceRouteIds), error);
    } finally {
      state.settled = true;
      if (active() && this.#canCompleteCurrent()) this.completeCurrent();
    }
  }

  #canCompleteCurrent(): boolean {
    return this.#browserDispatchComplete &&
      this.#pendingClientsByInstructionId.size === 0 &&
      (this.#devicePlayback === null || this.#devicePlayback.settled) &&
      (this.#desktopPlayback === null || this.#desktopPlayback.settled);
  }

  async #dispatchDesktop(instructions: readonly OverlayInstruction[], startsAt: number, state: DevicePlaybackState, start?: (at: number) => Promise<void>): Promise<void> {
    try { await (start === undefined ? this.#desktopVisualSink!.play(state.transportId, instructions, startsAt) : start(startsAt)); }
    catch (error) {
      this.#recordDesktopFailure(error, state);
    } finally {
      state.settled = true;
      if (!this.#closed && !state.cancelled && this.#desktopPlayback === state && this.#queue.getSnapshot().current?.id === state.occurrenceId && this.#canCompleteCurrent()) this.completeCurrent();
    }
  }

  #recordDesktopFailure(error: unknown, state: DevicePlaybackState): void {
      // A transported desktop renderer failure is already owned and persisted by
      // the supervisor under its renderer reference. Do not create a duplicate.
      if (!state.cancelled && ownedFailureReferenceId(error) === null) void this.#logger?.error("Desktop visual playback unavailable. Browser and audio outputs continue independently.", {
        module: "overlay-surfaces", source: "desktop-overlay.playback.failed", correlationId: this.#generateReferenceId?.() ?? state.occurrenceId, processingId: null,
        metadata: { playbackId: state.occurrenceId, nextStep: "Check the selected display and retry the desktop overlay in Settings. Interrupted content is not replayed." }
      }, error);
  }

  #prepareRecipient<T>(prepare: () => Promise<T>, failed: (error: unknown) => void | Promise<void>): Promise<T | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (value: T | null) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.#preparationCancels.delete(cancel); resolve(value);
      };
      const cancel = () => finish(null);
      const fail = async (error: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.#preparationCancels.delete(cancel);
        try { await failed(error); }
        catch (cleanupError) {
          void this.#recordOverlayTransportFailure("Playback preparation cleanup failed.", "overlay.playback.preparation-stop-failed", cleanupError);
        }
        resolve(null);
      };
      const timer = this.#scheduleTimer(() => { void fail(new Error("Playback preparation timed out after 15000ms.")); }, PLAYBACK_PREPARATION_TIMEOUT_MS);
      this.#preparationCancels.add(cancel);
      try { void prepare().then(finish, fail); }
      catch (error) { void fail(error); }
    });
  }

  #handleWatchdog(playbackId: string): Promise<PlaybackQueueSnapshot> {
    if (this.#closed || this.#queue.getSnapshot().current?.id !== playbackId) return Promise.resolve(this.#queue.getSnapshot());
    // Counts keep this diagnostic bounded even with many browser recipients.
    const metadata = {
      playbackId, terminalOutcome: "timed-out",
      pendingBrowserInstructionCount: this.#pendingClientsByInstructionId.size,
      pendingBrowserClientCount: [...this.#pendingClientsByInstructionId.values()].reduce((sum, value) => sum + (value.pendingClients?.size ?? 0), 0),
      pendingBrowserRecipients: JSON.stringify([...this.#pendingClientsByInstructionId].slice(0, 16).map(([instructionId, value]) => ({ instructionId: instructionId.slice(0, 256), clientIds: [...value.pendingClients ?? []].slice(0, 16).map(id => id.slice(0, 256)) }))),
      desktopPending: this.#desktopPlayback !== null && !this.#desktopPlayback.settled,
      audioPending: this.#devicePlayback !== null && !this.#devicePlayback.settled
    };
    void Promise.resolve().then(() => this.#logger?.error("Alert playback completion watchdog expired.", {
      module: "alerts", source: "overlay.playback.watchdog-expired",
      correlationId: this.#generateReferenceId?.() ?? playbackId, processingId: null, metadata
    })).catch(
      // error-provenance: allow cleanup -- the logger owns persistence fallback; expiry must still stop outputs
      () => undefined);
    // The legacy queue has no timeout state; skipped accurately avoids claiming completion.
    return this.#stopOccurrenceAndAdvance(playbackId, "skipped").catch(async (error: unknown) => {
      await this.#recordOverlayTransportFailure(
        "Timed-out alert playback could not be stopped cleanly.",
        "overlay.playback.watchdog-stop-failed",
        error,
        playbackId
      );
      return this.#queue.getSnapshot();
    });
  }

  #stopOccurrenceAndAdvance(
    playbackId: string,
    status: "completed" | "skipped"
  ): Promise<PlaybackQueueSnapshot> {
    if (this.#stoppingOccurrence?.id === playbackId) return this.#stoppingOccurrence.promise;
    const promise = (async () => {
      if (this.#closed || this.#queue.getSnapshot().current?.id !== playbackId) return this.#queue.getSnapshot();
      const state = this.#devicePlayback;
      const desktop = this.#desktopPlayback;
      if (state !== null) state.cancelled = true;
      if (desktop !== null) desktop.cancelled = true;
      this.#clearOccurrenceTimers();
      this.#stopBrowserInstructions(this.#browserInstructionIds);
      this.#pendingClientsByInstructionId.clear();
      this.#browserDispatchComplete = true;
      const desktopStop = desktop === null || this.#desktopVisualSink === null ? null :
        (desktop.stopping ??= this.#desktopVisualSink.stop(desktop.transportId));
      // Start both independent stops before waiting for either output.
      void desktopStop?.catch(
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      () => undefined);
      if (state !== null && this.#audioPlaybackSink !== null) {
        state.stopping ??= this.#audioPlaybackSink.stop(state.transportId);
        try {
          await state.stopping;
        } catch (error) {
          state.stopping = null;
          throw error;
        }
        state.settled = true;
      }
      try { if (desktopStop !== null) await desktopStop; }
      catch (error) { if (desktop !== null) desktop.stopping = null; throw error; }
      if (desktop !== null) desktop.settled = true;
      if (this.#closed || this.#queue.getSnapshot().current?.id !== playbackId) return this.#queue.getSnapshot();
      return this.#deliverCurrent(status === "skipped" ? this.#queue.skipCurrent() : this.#queue.completeCurrent());
    })();
    this.#stoppingOccurrence = { id: playbackId, promise };
    void promise.finally(() => {
      if (this.#stoppingOccurrence?.promise === promise) this.#stoppingOccurrence = null;
    }).catch(
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    () => undefined);
    return promise;
  }

  #scheduleTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  }

  #stopBrowserInstructions(instructionIds: readonly string[]): void {
    if (instructionIds.length === 0) return;
    try {
      this.#overlayPlaybackSink?.stopPlaybackInstructions?.(instructionIds);
    } catch (error) {
      void this.#recordOverlayTransportFailure(
        "Browser overlay playback instructions could not be stopped.",
        "overlay.playback.stop-failed",
        error,
        this.#queue.getSnapshot().current?.id
      );
      // A disconnected browser must not prevent the independent device path from reaching silence.
    }
  }

  #clearOccurrenceTimers(): void {
    for (const cancel of this.#preparationCancels) cancel();
    if (this.#completionTimer === null) return;
    clearTimeout(this.#completionTimer);
    this.#completionTimer = null;
  }

  async #recordDeviceAudioFailure(playbackId: string, routeIds: readonly string[], exception?: unknown): Promise<void> {
    if (this.#logger === null || this.#generateReferenceId === null) return;
    const routes = this.#audioOutputService?.listRoutes?.() ?? [];
    const ids = [...new Set(routeIds)];
    const routeNames = ids.map((id) => routes.find((route) => route.id === id)?.name ?? id);
    await this.#logger.error(`Alert audio outputs unavailable: ${routeNames.join(", ") || "desktop player"}. No automatic fallback was used.`, {
        module: "alerts", source: "audio.playback.failed", correlationId: this.#generateReferenceId(), processingId: null,
        metadata: {
          playbackId, routeIds: ids, routeNames,
          summary: "Alert audio delivery needs attention",
          nextStep: "Check the named routes in Audio outputs. Reconnect the saved device or explicitly rebind it; recovery applies to future playback only.",
          correctionLabel: "Open audio outputs", correctionRoute: "/manage/settings#audio-outputs"
        }
      }, exception);
  }

  async #recordOverlayTransportFailure(
    message: string,
    source: string,
    exception: unknown,
    playbackId = this.#queue.getSnapshot().current?.id,
    instructionId?: string
  ): Promise<void> {
    if (this.#logger === null || this.#generateReferenceId === null) return;
    await this.#logger.error(message, {
      module: "alerts",
      source,
      correlationId: this.#generateReferenceId(),
      processingId: null,
      metadata: {
        ...(playbackId === undefined ? {} : { playbackId }),
        ...(instructionId === undefined ? {} : { instructionId })
      }
    }, exception);
  }

  async #resolveVisualAssetMediaTypes(
    selectedVariants: Iterable<AlertVariant>,
    editorDocuments: Iterable<AlertEditorDocument>
  ): Promise<Readonly<Record<string, "image" | "gif" | "video">>> {
    const mediaTypes: Record<string, "image" | "gif" | "video"> = {
      ...this.#visualAssetMediaTypes
    };
    if (this.#assetRepository === null) {
      return mediaTypes;
    }

    const visualAssetIds = new Set<string>();
    for (const variant of selectedVariants) {
      if (variant.visualAssetId !== null && mediaTypes[variant.visualAssetId] === undefined) {
        visualAssetIds.add(variant.visualAssetId);
      }
    }
    for (const document of editorDocuments) {
      for (const layer of document.layers) {
        if ((layer.type === "image" || layer.type === "video") && mediaTypes[layer.assetId] === undefined) {
          visualAssetIds.add(layer.assetId);
        }
      }
    }

    const assets = this.#localMediaService === undefined ? await this.#assetRepository.findManyByIds([...visualAssetIds]) : await this.#localMediaService.captureAdmission([...visualAssetIds]);
    for (const [assetId, asset] of assets) {
      if (asset?.mediaType === "image" || asset?.mediaType === "gif" || asset?.mediaType === "video") {
        mediaTypes[assetId] = asset.mediaType;
      }
    }

    return mediaTypes;
  }

  async #loadEditorDocuments(
    matches: readonly AlertMatch[],
    selectedVariants: ReadonlyMap<string, AlertVariant>
  ): Promise<ReadonlyMap<string, AlertEditorDocument>> {
    if (this.#findEditorDocuments === null) return new Map();
    const editorIds = matches.map((match) => {
      const selected = selectedVariants.get(match.rule.id)!;
      return selected.id === match.rule.variants[0]?.id ? match.rule.id : selected.id;
    });
    return this.#findEditorDocuments(editorIds);
  }

  #result(
    status: Exclude<PlaybackEnqueueStatus, "queued">,
    matchedRuleIds: readonly string[],
    enqueuedAlertIds: readonly string[]
  ): PlaybackEnqueueResult {
    return {
      status,
      snapshot: this.#queue.getSnapshot(),
      matchedRuleIds,
      enqueuedAlertIds
    };
  }
}

function ownedFailureReferenceId(value: unknown): string | null {
  const seen = new Set<object>();
  let candidate = value;
  while (typeof candidate === "object" && candidate !== null && !seen.has(candidate)) {
    seen.add(candidate);
    const reference = Object.getOwnPropertyDescriptor(candidate, "referenceId")?.value;
    if (typeof reference === "string" && reference.trim() !== "") return reference;
    candidate = Object.getOwnPropertyDescriptor(candidate, "cause")?.value;
  }
  return null;
}

function readProviderPayloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function remoteTtsBaseKey(alert: ResolvedAlert, providerId: string, text: string): string {
  return [alert.sourceEventId, alert.ruleId, alert.variantId, providerId, text].join(":");
}
