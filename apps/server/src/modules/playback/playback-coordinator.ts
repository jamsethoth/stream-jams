import type {
  AlertMatcher,
  AlertMatch,
  AlertEditorDocument,
  AlertResolver,
  AlertResolverTarget,
  AlertService,
  AlertVariant,
  AssetRepository,
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
import { resolveAlertAudio } from "@stream-jams/core";
import type { AudioPlaybackSink, PlaybackQueueItem } from "@stream-jams/core";
import type { AudioOutputService } from "../audio/audio-output-service.js";

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
  deliverPlaybackInstruction(instruction: OverlayInstruction): { readonly deliveredClientIds: readonly string[] } | void;
  setPlaybackMuted?(muted: boolean): void;
  stopPlaybackInstructions?(instructionIds: readonly string[]): void;
}

export interface DesktopVisualPlaybackSink {
  play(occurrenceId: string, instructions: readonly OverlayInstruction[], startsAtEpochMs: number): Promise<void>;
  stop(occurrenceId: string): Promise<void>;
  close(): Promise<void>;
}

export interface PlaybackCoordinatorDependencies {
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
  readonly id: string;
  cancelled: boolean;
  settled: boolean;
  stopping: Promise<void> | null;
}

interface PendingBrowserInstruction {
  pendingClients: Set<string> | null;
  readonly completedBeforeDispatch: Set<string>;
  dispatchComplete: boolean;
}

const PLAYBACK_PREPARATION_TIMEOUT_MS = 5_000;
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
  readonly #overlayPlaybackSink: OverlayPlaybackInstructionSink | null;
  readonly #audioPlaybackSink: AudioPlaybackSink | null;
  readonly #desktopVisualSink: DesktopVisualPlaybackSink | null;
  #desktopPlayback: DevicePlaybackState | null = null;
  readonly #audioOutputService: PlaybackAudioOutputService | null;
  #devicePlayback: DevicePlaybackState | null = null;
  #closePromise: Promise<void> | null = null;
  #preparationTimer: ReturnType<typeof setTimeout> | null = null;
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

  constructor(dependencies: PlaybackCoordinatorDependencies) {
    this.#alertService = dependencies.alertService;
    this.#matcher = dependencies.matcher;
    this.#resolver = dependencies.resolver;
    this.#queue = dependencies.queue;
    this.#cooldownService = dependencies.cooldownService;
    this.#dedupeService = dependencies.dedupeService;
    this.#targets = dedupeTargets([dependencies.defaultTarget, ...(dependencies.additionalTargets ?? [])]);
    this.#visualAssetMediaTypes = dependencies.visualAssetMediaTypes ?? {};
    this.#assetRepository = dependencies.assetRepository ?? null;
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
    this.#pendingClientsByInstructionId.clear();
    const ids = this.#browserInstructionIds;
    this.#stopBrowserInstructions(ids);
    this.#closePromise = Promise.allSettled([this.#audioPlaybackSink?.close(), this.#desktopVisualSink?.close()]).then(results => {
      const failures = results.filter(result => result.status === "rejected").map(result => result.reason as unknown);
      if (failures.length > 0) throw new AggregateError(failures, "Playback output cleanup failed");
    });
    return this.#closePromise;
  }

  async enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> {
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
    const audio = readyMatches.flatMap(match => {
      const selected = selectedVariants.get(match.rule.id)!;
      const documentId = selected.id === match.rule.variants[0]?.id ? match.rule.id : selected.id;
      const document = editorDocuments.get(documentId);
      if (document === undefined || !document.enabled) return [];
      const resolved = resolveAlertAudio(document);
      return resolved === null || resolved.outputs.deviceRouteIds.length === 0 ? [] : [resolved];
    });
    const visualAssetMediaTypes = await this.#resolveVisualAssetMediaTypes(
      selectedVariants.values(),
      editorDocuments.values()
    );
    if (this.#closed) throw new Error("Playback has stopped.");
    const resolvedAlerts = this.#targets.flatMap((target) =>
      this.#resolver.resolveMatches({
        matches: readyMatches,
        target,
        visualAssetMediaTypes,
        editorDocuments,
        selectedVariants
      })
    );
    const snapshot = this.#deliverCurrent(this.#queue.enqueue({
      sourceEvent: event,
      alerts: resolvedAlerts,
      audio,
      priority: Math.max(...readyMatches.map((match) => match.rule.priority))
    }));

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
      } catch {
        await this.#recordRemoteTtsFailure(providerId, alert);
      }
    }
  }

  async #recordRemoteTtsFailure(providerId: string, alert: ResolvedAlert): Promise<void> {
    if (this.#logger === null || this.#generateReferenceId === null) return;
    const referenceId = this.#generateReferenceId();
    try {
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
        }
      );
    } catch {
      // Playback remains available when diagnostics storage itself is unavailable.
    }
  }

  enqueueResolvedTest(input: EnqueuePlaybackItemInput): PlaybackQueueSnapshot {
    if (this.#closed) throw new Error("Playback has stopped.");
    return this.#deliverCurrent(this.#queue.enqueue(input));
  }

  completeCurrent(): PlaybackQueueSnapshot {
    if (this.#closed || (this.#desktopPlayback !== null && (!this.#desktopPlayback.settled || this.#desktopPlayback.cancelled)) || (this.#devicePlayback !== null && (!this.#devicePlayback.settled || this.#devicePlayback.cancelled))) {
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

  replayRecent(itemId: string): PlaybackQueueSnapshot {
    return this.#deliverCurrent(this.#queue.replayRecent(itemId));
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
          void this.#dispatchRemoteTts(snapshot.current.alerts).catch(() => undefined);
        }
        return snapshot;
      }

      if (snapshot.current.id === this.#lastDeliveredCurrentItemId) {
        if (shouldDispatchRemoteTts && !snapshot.muted) {
          void this.#dispatchRemoteTts(snapshot.current.alerts).catch(() => undefined);
        }
        return snapshot;
      }

      this.#lastDeliveredCurrentItemId = snapshot.current.id;
      this.#clearOccurrenceTimers();
      this.#pendingClientsByInstructionId.clear();
      this.#browserDispatchComplete = false;
      this.#devicePlayback = null;
      this.#desktopPlayback = null;
      const startsAtEpochMs = Date.now() + 100;
      const desktopInstructions = snapshot.current.alerts.filter(alert => alert.desktopVisualEligible === true).map(alert => alert.overlayInstruction).filter(instruction =>
        instruction.moduleId === "alerts" && instruction.scope === "module" && instruction.targetProfileId === "landscape" &&
        (instruction.visual !== null || instruction.text !== null || instruction.shape != null));
      if (this.#desktopVisualSink !== null && desktopInstructions.length > 0) {
        this.#desktopPlayback = { id: snapshot.current.id, cancelled: false, settled: false, stopping: null };
      }
      const browserInstructions = (this.#overlayPlaybackSink === null ? [] : snapshot.current.alerts).map(alert => ({
        ...alert.overlayInstruction,
        timing: { startsAtEpochMs, endsAtEpochMs: startsAtEpochMs + alert.overlayInstruction.durationMs },
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
        const state = { id: snapshot.current.id, cancelled: false, settled: false, stopping: null };
        this.#devicePlayback = state;
        this.#preparationTimer = this.#scheduleTimer(
          () => { void this.#expireDevicePreparation(snapshot.current!, state); },
          PLAYBACK_PREPARATION_TIMEOUT_MS
        );
      }
      const occurrenceDurationMs = Math.max(
        0,
        ...snapshot.current.alerts.map(alert => alert.overlayInstruction.durationMs),
        ...snapshot.current.audio.map(audio => audio.durationMs)
      );
      this.#completionTimer = this.#scheduleTimer(
        () => { void this.#handleWatchdog(snapshot.current!.id); },
        occurrenceDurationMs + PLAYBACK_COMPLETION_GRACE_MS
      );
      if (this.#devicePlayback !== null) {
        const state = this.#devicePlayback;
        void this.#dispatchDeviceAudio(snapshot.current, state, startsAtEpochMs);
      }
      if (this.#desktopPlayback !== null) void this.#dispatchDesktop(desktopInstructions, startsAtEpochMs, this.#desktopPlayback);
      for (const instruction of browserInstructions) {
        const pending = this.#pendingClientsByInstructionId.get(instruction.id)!;
        try {
          const delivery = this.#overlayPlaybackSink!.deliverPlaybackInstruction(instruction);
          pending.dispatchComplete = true;
          if (delivery === undefined) {
            if (pending.completedBeforeDispatch.size > 0) this.#pendingClientsByInstructionId.delete(instruction.id);
          } else {
            pending.pendingClients = new Set(delivery.deliveredClientIds);
            for (const clientId of pending.completedBeforeDispatch) pending.pendingClients.delete(clientId);
            if (pending.pendingClients.size === 0) this.#pendingClientsByInstructionId.delete(instruction.id);
          }
        } catch {
          pending.dispatchComplete = true;
          this.#pendingClientsByInstructionId.delete(instruction.id);
        }
      }
      this.#browserDispatchComplete = true;
      if (shouldDispatchRemoteTts && !snapshot.muted) {
        void this.#dispatchRemoteTts(snapshot.current.alerts).catch(() => undefined);
      }

      if (!this.#canCompleteCurrent()) {
        return snapshot;
      }
      this.#clearOccurrenceTimers();
      snapshot = this.#queue.completeCurrent();
    }
  }

  async #dispatchDeviceAudio(item: PlaybackQueueItem, state: DevicePlaybackState, startsAtEpochMs: number): Promise<void> {
    const active = () => !this.#closed && !state.cancelled && this.#devicePlayback === state;
    try {
      const prepared = await this.#audioOutputService!.preparePlayback(item.id, item.audio);
      if (this.#devicePlayback === state) this.#clearPreparationTimer();
      if (!active()) return;
      if (prepared.unavailableRouteIds.length > 0) void this.#recordDeviceAudioFailure(item.id, prepared.unavailableRouteIds);
      // All documents belong to one occurrence. One failed document must not
      // release the queue while other documents are still playing.
      let requiresExplicitStop = false;
      await Promise.allSettled(prepared.batches.map(async batch => {
        if (!active()) return;
        try {
          const result = await this.#audioPlaybackSink!.play({ ...batch, timing: { startsAtEpochMs, endsAtEpochMs: startsAtEpochMs + batch.durationMs }, muted: this.#queue.getSnapshot().muted });
          if (result.failedRouteIds.length > 0) void this.#recordDeviceAudioFailure(item.id, result.failedRouteIds);
        } catch {
          requiresExplicitStop = true;
          void this.#recordDeviceAudioFailure(item.id, batch.destinations.flatMap(destination => destination.routeIds));
        }
      }));
      if (requiresExplicitStop && active()) {
        try {
          state.stopping ??= this.#audioPlaybackSink!.stop(item.id);
          await state.stopping;
        } catch {
          state.stopping = null;
          state.cancelled = true;
          this.#clearOccurrenceTimers();
          return;
        }
      }
    } catch {
      if (this.#devicePlayback === state) this.#clearPreparationTimer();
      void this.#recordDeviceAudioFailure(item.id, item.audio.flatMap(audio => audio.outputs.deviceRouteIds));
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

  async #dispatchDesktop(instructions: readonly OverlayInstruction[], startsAt: number, state: DevicePlaybackState): Promise<void> {
    try { await this.#desktopVisualSink!.play(state.id, instructions, startsAt); }
    catch {
      if (!state.cancelled) void this.#logger?.error("Desktop visual playback unavailable. Browser and audio outputs continue independently.", {
        module: "overlay-surfaces", source: "desktop-overlay.playback.failed", correlationId: this.#generateReferenceId?.() ?? state.id, processingId: null,
        metadata: { playbackId: state.id, nextStep: "Check the selected display and retry the desktop overlay in Settings. Interrupted content is not replayed." }
      }).catch(() => undefined);
    } finally {
      state.settled = true;
      if (!this.#closed && !state.cancelled && this.#desktopPlayback === state && this.#queue.getSnapshot().current?.id === state.id && this.#canCompleteCurrent()) this.completeCurrent();
    }
  }

  async #expireDevicePreparation(item: PlaybackQueueItem, state: DevicePlaybackState): Promise<void> {
    if (this.#closed || this.#devicePlayback !== state || state.cancelled) return;
    this.#clearPreparationTimer();
    state.cancelled = true;
    void this.#recordDeviceAudioFailure(item.id, item.audio.flatMap(audio => audio.outputs.deviceRouteIds));
    try {
      state.stopping ??= this.#audioPlaybackSink!.stop(item.id);
      await state.stopping;
    } catch {
      state.stopping = null;
      this.#clearOccurrenceTimers();
      return;
    }
    if (this.#closed || this.#devicePlayback !== state || this.#stoppingOccurrence !== null) return;
    // No device dispatch may follow this preparation. Release only its token;
    // healthy browser recipients retain their own completion and watchdog.
    this.#devicePlayback = null;
    if (this.#canCompleteCurrent()) this.completeCurrent();
  }

  #handleWatchdog(playbackId: string): Promise<PlaybackQueueSnapshot> {
    return this.#stopOccurrenceAndAdvance(playbackId, "completed").catch(() => this.#queue.getSnapshot());
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
        (desktop.stopping ??= this.#desktopVisualSink.stop(playbackId));
      // Start both independent stops before waiting for either output.
      void desktopStop?.catch(() => undefined);
      if (state !== null && this.#audioPlaybackSink !== null) {
        state.stopping ??= this.#audioPlaybackSink.stop(playbackId);
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
    }).catch(() => undefined);
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
    } catch {
      // A disconnected browser must not prevent the independent device path from reaching silence.
    }
  }

  #clearPreparationTimer(): void {
    if (this.#preparationTimer === null) return;
    clearTimeout(this.#preparationTimer);
    this.#preparationTimer = null;
  }

  #clearOccurrenceTimers(): void {
    this.#clearPreparationTimer();
    if (this.#completionTimer === null) return;
    clearTimeout(this.#completionTimer);
    this.#completionTimer = null;
  }

  async #recordDeviceAudioFailure(playbackId: string, routeIds: readonly string[]): Promise<void> {
    if (this.#logger === null || this.#generateReferenceId === null) return;
    try {
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
      });
    } catch {
      // Diagnostics failure must not prevent healthy outputs or queue completion.
    }
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

    const assets = await this.#assetRepository.findManyByIds([...visualAssetIds]);
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

function readProviderPayloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function remoteTtsBaseKey(alert: ResolvedAlert, providerId: string, text: string): string {
  return [alert.sourceEventId, alert.ruleId, alert.variantId, providerId, text].join(":");
}
