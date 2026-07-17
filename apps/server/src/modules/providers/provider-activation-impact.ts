import type { ProviderActivationImpact, ProviderCapability } from "@stream-jams/core";

export interface ProviderActivationImpactInput {
  readonly capability: ProviderCapability;
  readonly affectedAlertCount: number;
  readonly changesProviderKind: boolean;
  readonly currentProviderName: string;
  readonly targetProviderName: string;
  readonly occurredAt: string;
}

export function evaluateProviderActivationImpact(input: ProviderActivationImpactInput): ProviderActivationImpact {
  if (input.capability === "event-source" || !input.changesProviderKind || input.affectedAlertCount === 0) {
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
