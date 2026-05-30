import type {
  AlertMatcher,
  AlertMatch,
  AlertResolver,
  AlertResolverTarget,
  AlertService,
  AssetRepository,
  NormalizedStreamEvent,
  PlaybackCooldownService,
  PlaybackDedupeService,
  PlaybackQueue,
  PlaybackQueueSnapshot,
  ResolvedAlert,
  OverlayInstruction
} from "@stream-jams/core";

export type PlaybackEnqueueStatus = "queued" | "duplicate" | "no-matches" | "cooldown";

export interface PlaybackEnqueueResult {
  readonly status: PlaybackEnqueueStatus;
  readonly snapshot: PlaybackQueueSnapshot;
  readonly matchedRuleIds: readonly string[];
  readonly enqueuedAlertIds: readonly string[];
}

export interface OverlayPlaybackInstructionSink {
  deliverPlaybackInstruction(instruction: OverlayInstruction): void;
}

export interface PlaybackCoordinatorDependencies {
  readonly alertService: Pick<AlertService, "listActiveRules">;
  readonly matcher: AlertMatcher;
  readonly resolver: AlertResolver;
  readonly queue: PlaybackQueue;
  readonly cooldownService: PlaybackCooldownService;
  readonly dedupeService: PlaybackDedupeService;
  readonly defaultTarget: AlertResolverTarget;
  readonly visualAssetMediaTypes?: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly assetRepository?: Pick<AssetRepository, "findById">;
  readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink;
}

export class PlaybackCoordinator {
  readonly #alertService: Pick<AlertService, "listActiveRules">;
  readonly #matcher: AlertMatcher;
  readonly #resolver: AlertResolver;
  readonly #queue: PlaybackQueue;
  readonly #cooldownService: PlaybackCooldownService;
  readonly #dedupeService: PlaybackDedupeService;
  readonly #defaultTarget: AlertResolverTarget;
  readonly #visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly #assetRepository: Pick<AssetRepository, "findById"> | null;
  readonly #overlayPlaybackSink: OverlayPlaybackInstructionSink | null;
  #lastDeliveredCurrentItemId: string | null = null;

  constructor(dependencies: PlaybackCoordinatorDependencies) {
    this.#alertService = dependencies.alertService;
    this.#matcher = dependencies.matcher;
    this.#resolver = dependencies.resolver;
    this.#queue = dependencies.queue;
    this.#cooldownService = dependencies.cooldownService;
    this.#dedupeService = dependencies.dedupeService;
    this.#defaultTarget = dependencies.defaultTarget;
    this.#visualAssetMediaTypes = dependencies.visualAssetMediaTypes ?? {};
    this.#assetRepository = dependencies.assetRepository ?? null;
    this.#overlayPlaybackSink = dependencies.overlayPlaybackSink ?? null;
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

    const resolvedAlerts = this.#resolver.resolveMatches({
      matches: readyMatches,
      target: this.#defaultTarget,
      visualAssetMediaTypes: await this.#resolveVisualAssetMediaTypes(readyMatches)
    });
    const snapshot = this.#queue.enqueue({
      sourceEvent: event,
      alerts: resolvedAlerts,
      priority: Math.max(...readyMatches.map((match) => match.rule.priority))
    });
    this.#deliverCurrent(snapshot);

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

  completeCurrent(): PlaybackQueueSnapshot {
    const snapshot = this.#queue.completeCurrent();
    this.#deliverCurrent(snapshot);
    return snapshot;
  }

  skipCurrent(): PlaybackQueueSnapshot {
    const snapshot = this.#queue.skipCurrent();
    this.#deliverCurrent(snapshot);
    return snapshot;
  }

  replayRecent(itemId: string): PlaybackQueueSnapshot {
    const snapshot = this.#queue.replayRecent(itemId);
    this.#deliverCurrent(snapshot);
    return snapshot;
  }

  pause(): PlaybackQueueSnapshot {
    return this.#queue.pause();
  }

  resume(): PlaybackQueueSnapshot {
    const snapshot = this.#queue.resume();
    this.#deliverCurrent(snapshot);
    return snapshot;
  }

  mute(): PlaybackQueueSnapshot {
    return this.#queue.mute();
  }

  unmute(): PlaybackQueueSnapshot {
    return this.#queue.unmute();
  }

  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot {
    const snapshot = this.#queue.setDoNotDisturb(enabled);
    this.#deliverCurrent(snapshot);
    return snapshot;
  }

  #deliverCurrent(snapshot: PlaybackQueueSnapshot): void {
    if (this.#overlayPlaybackSink === null) {
      return;
    }

    if (snapshot.current === null) {
      this.#lastDeliveredCurrentItemId = null;
      return;
    }

    if (snapshot.current.id === this.#lastDeliveredCurrentItemId) {
      return;
    }

    this.#lastDeliveredCurrentItemId = snapshot.current.id;
    for (const alert of snapshot.current.alerts) {
      this.#overlayPlaybackSink.deliverPlaybackInstruction(alert.overlayInstruction);
    }
  }

  async #resolveVisualAssetMediaTypes(
    matches: readonly AlertMatch[]
  ): Promise<Readonly<Record<string, "image" | "gif" | "video">>> {
    const mediaTypes: Record<string, "image" | "gif" | "video"> = {
      ...this.#visualAssetMediaTypes
    };
    if (this.#assetRepository === null) {
      return mediaTypes;
    }

    const visualAssetIds = new Set<string>();
    for (const match of matches) {
      for (const variant of match.rule.variants) {
        if (variant.visualAssetId !== null && mediaTypes[variant.visualAssetId] === undefined) {
          visualAssetIds.add(variant.visualAssetId);
        }
      }
    }

    for (const assetId of visualAssetIds) {
      const asset = await this.#assetRepository.findById(assetId);
      if (asset?.mediaType === "image" || asset?.mediaType === "gif" || asset?.mediaType === "video") {
        mediaTypes[assetId] = asset.mediaType;
      }
    }

    return mediaTypes;
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
