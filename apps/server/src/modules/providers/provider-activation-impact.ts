import type { ActionableManagementError, ProviderActivationImpact, ProviderCapability } from "@stream-jams/core";
import type { ProviderRegistrationRecord, SqliteProviderRegistrationRepository } from "./sqlite-provider-registration-repository.js";

/** Direct Twitch and a Streamer.bot registration that forwards Twitch events, both in use after activation. */
export interface OverlappingTwitchSources {
  readonly twitchName: string;
  readonly streamerBotName: string;
  readonly streamerBotProviderId: string;
}

/**
 * Finds the direct Twitch and Twitch-forwarding Streamer.bot pair that activating `target` would leave in use
 * together, or null when activation creates no new overlap.
 */
export async function findOverlappingTwitchSources(
  repository: Pick<SqliteProviderRegistrationRepository, "findActiveByKind">,
  target: ProviderRegistrationRecord
): Promise<OverlappingTwitchSources | null> {
  if (target.provider.capability !== "event-source" || target.provider.active) return null;
  if (target.provider.kind === "twitch") {
    const streamerBot = await repository.findActiveByKind("streamerbot");
    return streamerBot === null || !forwardsTwitchEvents(streamerBot) ? null : overlap(target, streamerBot);
  }
  if (target.provider.kind === "streamerbot" && forwardsTwitchEvents(target)) {
    const twitch = await repository.findActiveByKind("twitch");
    return twitch === null ? null : overlap(twitch, target);
  }
  return null;
}

/** Streamer.bot forwards Twitch events unless its configuration turns forwarding off. */
export function forwardsTwitchEvents(record: ProviderRegistrationRecord): boolean {
  return record.configuration.forwardTwitchEvents !== false;
}

function overlap(twitch: ProviderRegistrationRecord, streamerBot: ProviderRegistrationRecord): OverlappingTwitchSources {
  return { twitchName: twitch.provider.name, streamerBotName: streamerBot.provider.name, streamerBotProviderId: streamerBot.provider.id };
}

export interface ProviderActivationImpactInput {
  readonly capability: ProviderCapability;
  readonly affectedAlertCount: number;
  readonly changesProviderKind: boolean;
  readonly currentProviderName: string;
  readonly targetProviderName: string;
  readonly occurredAt: string;
  readonly overlappingTwitchSources?: OverlappingTwitchSources | null | undefined;
}

export function evaluateProviderActivationImpact(input: ProviderActivationImpactInput): ProviderActivationImpact {
  if (input.capability === "music-source") {
    return { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] };
  }
  if (input.capability === "event-source") {
    const overlap = input.overlappingTwitchSources ?? null;
    return {
      matchedAlertCount: input.affectedAlertCount,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: overlap === null ? [] : [overlappingTwitchSourcesWarning(overlap, input.occurredAt)]
    };
  }
  if (!input.changesProviderKind || input.affectedAlertCount === 0) {
    return {
      matchedAlertCount: input.affectedAlertCount,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    };
  }

  return {
    matchedAlertCount: 0,
    unmatchedAlertCount: input.affectedAlertCount,
    blockers: [],
    warnings: [
      {
        summary: "Active alerts use a different provider kind",
        cause: `${input.affectedAlertCount} active alert${input.affectedAlertCount === 1 ? "" : "s"} currently use ${input.currentProviderName}.`,
        nextStep: `Confirm the switch to ${input.targetProviderName}, then review affected alerts before going live.`,
        severity: "warning",
        occurredAt: input.occurredAt,
        referenceId: null,
        correction: { label: "Review active alerts", route: "/manage/modules/alerts" }
      }
    ]
  };
}

function overlappingTwitchSourcesWarning(overlap: OverlappingTwitchSources, occurredAt: string): ActionableManagementError {
  return {
    summary: "Twitch events will arrive from two sources",
    cause: `${overlap.twitchName} and ${overlap.streamerBotName} both deliver the same Twitch events. Duplicates are merged, so each event plays once.`,
    nextStep: `Confirm to use both, or turn off Twitch forwarding in ${overlap.streamerBotName} so direct Twitch is the only Twitch path.`,
    severity: "warning",
    occurredAt,
    referenceId: null,
    correction: {
      label: "Review Twitch forwarding",
      route: `/manage/event-sources?provider=${encodeURIComponent(overlap.streamerBotProviderId)}`
    }
  };
}
