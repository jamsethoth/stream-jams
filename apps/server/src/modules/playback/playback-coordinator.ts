import type {
  AlertMatcher,
  AlertResolver,
  AlertResolverTarget,
  AlertService,
  NormalizedStreamEvent,
  PlaybackCooldownService,
  PlaybackDedupeService,
  PlaybackQueue,
  PlaybackQueueSnapshot,
  ResolvedAlert
} from "@stream-jams/core";

export type PlaybackEnqueueStatus = "queued" | "duplicate" | "no-matches" | "cooldown";

export interface PlaybackEnqueueResult {
  readonly status: PlaybackEnqueueStatus;
  readonly snapshot: PlaybackQueueSnapshot;
  readonly matchedRuleIds: readonly string[];
  readonly enqueuedAlertIds: readonly string[];
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

  constructor(dependencies: PlaybackCoordinatorDependencies) {
    this.#alertService = dependencies.alertService;
    this.#matcher = dependencies.matcher;
    this.#resolver = dependencies.resolver;
    this.#queue = dependencies.queue;
    this.#cooldownService = dependencies.cooldownService;
    this.#dedupeService = dependencies.dedupeService;
    this.#defaultTarget = dependencies.defaultTarget;
    this.#visualAssetMediaTypes = dependencies.visualAssetMediaTypes ?? {};
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
      visualAssetMediaTypes: this.#visualAssetMediaTypes
    });
    const snapshot = this.#queue.enqueue({
      sourceEvent: event,
      alerts: resolvedAlerts,
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

  completeCurrent(): PlaybackQueueSnapshot {
    return this.#queue.completeCurrent();
  }

  skipCurrent(): PlaybackQueueSnapshot {
    return this.#queue.skipCurrent();
  }

  replayRecent(itemId: string): PlaybackQueueSnapshot {
    return this.#queue.replayRecent(itemId);
  }

  pause(): PlaybackQueueSnapshot {
    return this.#queue.pause();
  }

  resume(): PlaybackQueueSnapshot {
    return this.#queue.resume();
  }

  mute(): PlaybackQueueSnapshot {
    return this.#queue.mute();
  }

  unmute(): PlaybackQueueSnapshot {
    return this.#queue.unmute();
  }

  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot {
    return this.#queue.setDoNotDisturb(enabled);
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
