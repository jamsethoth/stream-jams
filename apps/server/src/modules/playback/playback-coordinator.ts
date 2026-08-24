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
  readonly findEditorDocuments?: (alertIds: readonly string[]) => Promise<ReadonlyMap<string, AlertEditorDocument>>;
  readonly ttsService?: Pick<TtsService, "createPlaybackInstructionFromModeratedText">;
  readonly logger?: Pick<Logger, "error">;
  readonly generateReferenceId?: () => string;
  readonly persistPlaybackSafetyState?: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
}

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
  readonly #findEditorDocuments:
    ((alertIds: readonly string[]) => Promise<ReadonlyMap<string, AlertEditorDocument>>) | null;
  readonly #ttsService: Pick<TtsService, "createPlaybackInstructionFromModeratedText"> | null;
  readonly #logger: Pick<Logger, "error"> | null;
  readonly #generateReferenceId: (() => string) | null;
  readonly #persistPlaybackSafetyState: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
  #lastDeliveredCurrentItemId: string | null = null;
  #lastRemoteTtsItemId: string | null = null;
  #pendingClientsByInstructionId = new Map<string, Set<string> | null>();

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

  async enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> {
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
    const visualAssetMediaTypes = await this.#resolveVisualAssetMediaTypes(
      selectedVariants.values(),
      editorDocuments.values()
    );
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
    return this.#deliverCurrent(this.#queue.enqueue(input));
  }

  completeCurrent(): PlaybackQueueSnapshot {
    return this.#deliverCurrent(this.#queue.completeCurrent());
  }

  reportInstructionFinished(clientId: string, instructionId: string): PlaybackQueueSnapshot {
    const snapshot = this.#queue.getSnapshot();
    const pendingClients = this.#pendingClientsByInstructionId.get(instructionId);
    if (snapshot.current?.id !== this.#lastDeliveredCurrentItemId || pendingClients === undefined) {
      return snapshot;
    }

    if (pendingClients !== null && !pendingClients.delete(clientId)) {
      return snapshot;
    }
    if (pendingClients === null || pendingClients.size === 0) {
      this.#pendingClientsByInstructionId.delete(instructionId);
    }
    return this.#pendingClientsByInstructionId.size === 0 ? this.completeCurrent() : snapshot;
  }

  reportClientDisconnected(clientId: string): PlaybackQueueSnapshot {
    const snapshot = this.#queue.getSnapshot();
    if (snapshot.current?.id !== this.#lastDeliveredCurrentItemId) {
      return snapshot;
    }

    let removed = false;
    for (const [instructionId, pendingClients] of this.#pendingClientsByInstructionId) {
      if (pendingClients !== null && pendingClients.delete(clientId)) {
        removed = true;
        if (pendingClients.size === 0) {
          this.#pendingClientsByInstructionId.delete(instructionId);
        }
      }
    }
    return removed && this.#pendingClientsByInstructionId.size === 0 ? this.completeCurrent() : snapshot;
  }

  skipCurrent(): PlaybackQueueSnapshot {
    const instructionIds = this.#queue.getSnapshot().current?.alerts.map((alert) => alert.overlayInstruction.id) ?? [];
    if (instructionIds.length > 0) {
      this.#overlayPlaybackSink?.stopPlaybackInstructions?.(instructionIds);
    }
    return this.#deliverCurrent(this.#queue.skipCurrent());
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
    return snapshot;
  }

  async unmute(): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ muted: false });
    const snapshot = this.#queue.unmute();
    this.#overlayPlaybackSink?.setPlaybackMuted?.(snapshot.muted);
    return snapshot;
  }

  async setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot> {
    await this.#persistPlaybackSafetyState({ doNotDisturb: enabled });
    return this.#deliverCurrent(this.#queue.setDoNotDisturb(enabled));
  }

  #deliverCurrent(initialSnapshot: PlaybackQueueSnapshot): PlaybackQueueSnapshot {
    let snapshot = initialSnapshot;
    while (true) {
      if (snapshot.current === null) {
        this.#lastDeliveredCurrentItemId = null;
        this.#lastRemoteTtsItemId = null;
        this.#pendingClientsByInstructionId.clear();
        return snapshot;
      }

      const shouldDispatchRemoteTts = snapshot.current.id !== this.#lastRemoteTtsItemId;
      if (shouldDispatchRemoteTts) {
        this.#lastRemoteTtsItemId = snapshot.current.id;
      }

      if (this.#overlayPlaybackSink === null) {
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
      this.#pendingClientsByInstructionId.clear();
      for (const alert of snapshot.current.alerts) {
        const instructionId = alert.overlayInstruction.id;
        const delivery = this.#overlayPlaybackSink.deliverPlaybackInstruction(alert.overlayInstruction);
        if (delivery === undefined) {
          this.#pendingClientsByInstructionId.set(instructionId, null);
        } else if (delivery.deliveredClientIds.length > 0) {
          this.#pendingClientsByInstructionId.set(instructionId, new Set(delivery.deliveredClientIds));
        }
      }
      if (shouldDispatchRemoteTts && !snapshot.muted) {
        void this.#dispatchRemoteTts(snapshot.current.alerts).catch(() => undefined);
      }

      if (this.#pendingClientsByInstructionId.size > 0) {
        return snapshot;
      }
      snapshot = this.#queue.completeCurrent();
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
