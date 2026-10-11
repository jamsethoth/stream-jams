/**
 * Converts pre-selector Screen Effect binding rows and timer event rules to shared trigger selectors, for
 * backups taken before schema 37. Migration 037 performs the same conversion on the live database.
 */

/** Converts one `screen_effect_bindings` row; rows already in selector form are returned unchanged. */
export function upgradeLegacyEffectBindingRow(row: Record<string, unknown>): Record<string, unknown> {
  const document = parseObject(row.document_json);
  if (document === null || "selector" in document) return row;
  if (row.kind === "twitch-reward") {
    return {
      ...row,
      document_json: JSON.stringify({
        id: document.id,
        selector: { match: { kind: "twitch-reward", broadcasterId: document.broadcasterId, rewardId: document.rewardId }, sources: "any", conditions: [] }
      })
    };
  }
  if (row.kind !== "streamerbot-event") return row;
  return {
    ...row,
    kind: "external",
    canonical_identity: `external:${JSON.stringify(["streamerbot", document.sourceKey, document.eventType])}`,
    document_json: JSON.stringify({
      id: document.id,
      selector: {
        match: { kind: "external", providerKind: "streamerbot", sourceKey: document.sourceKey, eventType: document.eventType },
        sources: "any",
        conditions: []
      }
    })
  };
}

/** Keeps the first binding of each effect whose converted identity repeats, as migration 037 does. */
export function upgradeLegacyEffectBindingRows(rows: readonly Record<string, unknown>[]): readonly Record<string, unknown>[] {
  const upgraded = rows.map(upgradeLegacyEffectBindingRow);
  const firstPositions = new Map<string, number>();
  for (const row of upgraded) {
    const key = JSON.stringify([row.effect_id, row.canonical_identity]);
    const position = Number(row.position);
    if (!firstPositions.has(key) || position < firstPositions.get(key)!) firstPositions.set(key, position);
  }
  return upgraded.filter((row) => firstPositions.get(JSON.stringify([row.effect_id, row.canonical_identity])) === Number(row.position));
}

/** Converts a `timer_definitions.event_rules_json` value; rules already in selector form are kept. */
export function upgradeLegacyTimerEventRules(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let rules: unknown;
  try {
    rules = JSON.parse(value) as unknown;
  }
  // error-provenance: allow expected -- an unreadable value is left for restore validation to reject
  catch {
    return value;
  }
  if (!Array.isArray(rules)) return value;
  return JSON.stringify(rules.map((rule: unknown) => {
    if (typeof rule !== "object" || rule === null || "selector" in rule) return rule;
    const legacy = rule as Record<string, unknown>;
    const conditions = [
      ...(legacy.rewardId == null ? [] : [{ field: "channelPointReward", operator: "equals", value: legacy.rewardId }]),
      ...(legacy.tier == null ? [] : [{ field: "tier", operator: "equals", value: legacy.tier }])
    ];
    return {
      enabled: legacy.enabled,
      selector: {
        match: { kind: "canonical", type: legacy.eventType },
        sources: legacy.ingestProvider === "any" ? "any" : [legacy.ingestProvider],
        conditions
      },
      action: legacy.action,
      amountMs: legacy.amountMs,
      quantityUnit: legacy.quantityUnit,
      inactiveBehavior: legacy.inactiveBehavior
    };
  }));
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  }
  // error-provenance: allow expected -- an unreadable row is left for restore validation to reject
  catch {
    return null;
  }
}
