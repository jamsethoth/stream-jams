import {
  alertStarterTemplates,
  buildAlertPriorityGroups,
  formatAlertConditionSummary,
  type AlertCondition,
  type AlertInventoryRow,
  type AlertValidationIssue,
  type StreamEventType,
  type TargetProfileId
} from "@stream-jams/core";

export type AlertEventGroupStatus = "blocker" | "warning" | "needs-review" | "valid";

export interface AlertDefaultGroup {
  readonly alert: AlertInventoryRow;
  readonly variations: readonly AlertInventoryRow[];
}

export interface AlertEventGroup {
  readonly key: string;
  readonly eventType: string;
  readonly label: string;
  readonly catalogGroup: string;
  readonly known: boolean;
  readonly defaults: readonly AlertDefaultGroup[];
  readonly orphanVariations: readonly AlertInventoryRow[];
  readonly defaultCount: number;
  readonly variationCount: number;
  readonly enabledCount: number;
  readonly status: AlertEventGroupStatus;
  readonly statusByAlertId: Readonly<Record<string, AlertEventGroupStatus>>;
}

export interface AlertInventorySummary {
  readonly conditionSummaries: readonly string[];
  readonly prioritySummary: string | null;
  readonly weightSummary: string | null;
}

export interface AlertEventGroupFilters {
  readonly query?: string;
  readonly eventType?: string;
  readonly status?: AlertEventGroupStatus | "enabled" | "disabled";
  readonly profileId?: TargetProfileId;
}

export interface FilteredAlertEventGroup extends AlertEventGroup {
  readonly matchingDefaultCount: number;
  readonly matchingVariationCount: number;
}

export interface FilteredAlertEventGroups {
  readonly groups: readonly FilteredAlertEventGroup[];
  readonly forcedOpenKeys: ReadonlySet<string>;
  readonly matchingAlertCount: number;
  readonly totalAlertCount: number;
  readonly hasActiveFilters: boolean;
}

export function buildAlertEventGroups(
  rows: readonly AlertInventoryRow[],
  issues: readonly AlertValidationIssue[]
): readonly AlertEventGroup[] {
  const knownEventTypes = new Set<string>(alertStarterTemplates.map(({ eventType }) => eventType));
  const unknownEventTypes = [...new Set(rows
    .map(({ eventType }) => eventType)
    .filter((eventType) => !knownEventTypes.has(eventType)))];
  const definitions = [
    ...alertStarterTemplates.map(({ eventType, group, label }) => ({
      eventType,
      catalogGroup: group,
      label,
      known: true
    })),
    ...unknownEventTypes.map((eventType) => ({
      eventType,
      catalogGroup: "Other",
      label: eventType,
      known: false
    }))
  ];

  return definitions.map((definition) => {
    const eventRows = rows.filter(({ eventType }) => eventType === definition.eventType);
    const defaults = eventRows.filter(({ kind }) => kind === "default");
    const attachedVariationIds = new Set<string>();
    const groupedDefaults = defaults.map((alert) => {
      const variations = eventRows.filter((candidate) =>
        candidate.kind === "variation" && candidate.parentAlertId === alert.id
      );
      for (const variation of variations) attachedVariationIds.add(variation.id);
      return { alert, variations };
    });
    const orphanVariations = eventRows.filter((row) =>
      row.kind === "variation" && !attachedVariationIds.has(row.id)
    );
    const relevantIssues = issues.filter((issue) =>
      issue.eventType === definition.eventType || (
        issue.alertId !== null && eventRows.some(({ id }) => id === issue.alertId)
      )
    );
    const statusByAlertId = Object.fromEntries(eventRows.map((row) => [
      row.id,
      highestStatus([
        row.reviewState === "needs-review" ? "needs-review" : "valid",
        ...relevantIssues
          .filter((issue) => issue.alertId === row.id || issue.eventType === definition.eventType)
          .map(({ severity }) => severity)
      ])
    ]));

    return {
      key: `event:${definition.eventType}`,
      ...definition,
      defaults: groupedDefaults,
      orphanVariations,
      defaultCount: defaults.length,
      variationCount: eventRows.length - defaults.length,
      enabledCount: eventRows.filter(({ enabled }) => enabled).length,
      status: highestStatus([
        ...Object.values(statusByAlertId),
        ...relevantIssues.map(({ severity }) => severity)
      ]),
      statusByAlertId
    };
  });
}

export function filterAlertEventGroups(
  groups: readonly AlertEventGroup[],
  filters: AlertEventGroupFilters
): FilteredAlertEventGroups {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  const eventType = normalizeFilter(filters.eventType);
  const status = normalizeFilter(filters.status);
  const profileId = normalizeFilter(filters.profileId);
  const hasActiveFilters = query !== "" || eventType !== undefined || status !== undefined || profileId !== undefined;
  const totalAlertCount = groups.reduce((total, group) => total + group.defaultCount + group.variationCount, 0);
  if (!hasActiveFilters) {
    return {
      groups: groups.map((group) => ({
        ...group,
        matchingDefaultCount: group.defaultCount,
        matchingVariationCount: group.variationCount
      })),
      forcedOpenKeys: new Set(),
      matchingAlertCount: totalAlertCount,
      totalAlertCount,
      hasActiveFilters: false
    };
  }

  const filteredGroups: FilteredAlertEventGroup[] = [];
  const forcedOpenKeys = new Set<string>();
  let matchingAlertCount = 0;
  for (const group of groups) {
    if (eventType !== undefined && group.eventType !== eventType) continue;
    const eventMatchesQuery = query !== "" && includesQuery(
      `${group.label} ${group.eventType} ${group.catalogGroup}`,
      query
    );
    const filteredDefaults: AlertDefaultGroup[] = [];
    let matchingDefaultCount = 0;
    let matchingVariationCount = 0;
    for (const defaultGroup of group.defaults) {
      const defaultMatchesQuery = query === "" || eventMatchesQuery || rowIncludesQuery(defaultGroup.alert, query);
      const defaultMatchesOther = rowMatchesOther(defaultGroup.alert, group, status, profileId);
      const defaultMatches = defaultMatchesQuery && defaultMatchesOther;
      const matchingVariations = defaultGroup.variations.filter((variation) => {
        const variationMatchesQuery = query === "" || eventMatchesQuery || defaultMatchesQuery || rowIncludesQuery(variation, query);
        return variationMatchesQuery && rowMatchesOther(variation, group, status, profileId);
      });
      const variationMatches = matchingVariations.filter((variation) =>
        query === "" || eventMatchesQuery || rowIncludesQuery(variation, query)
      ).length;
      if (!defaultMatches && matchingVariations.length === 0) continue;
      if (defaultMatches) matchingDefaultCount += 1;
      matchingVariationCount += variationMatches;
      filteredDefaults.push({
        alert: defaultGroup.alert,
        variations: defaultMatchesQuery && status === undefined && profileId === undefined
          ? defaultGroup.variations
          : matchingVariations
      });
    }
    const orphanVariations = group.orphanVariations.filter((variation) => (
      (query === "" || eventMatchesQuery || rowIncludesQuery(variation, query))
      && rowMatchesOther(variation, group, status, profileId)
    ));
    matchingVariationCount += orphanVariations.length;
    const emptyGroupMatches = group.defaultCount === 0
      && group.variationCount === 0
      && (eventMatchesQuery || eventType === group.eventType)
      && (status === undefined || group.status === status)
      && profileId === undefined;
    if (filteredDefaults.length === 0 && orphanVariations.length === 0 && !emptyGroupMatches) continue;
    const filtered = {
      ...group,
      defaults: filteredDefaults,
      orphanVariations,
      matchingDefaultCount,
      matchingVariationCount
    };
    filteredGroups.push(filtered);
    forcedOpenKeys.add(group.key);
    matchingAlertCount += matchingDefaultCount + matchingVariationCount;
  }

  return { groups: filteredGroups, forcedOpenKeys, matchingAlertCount, totalAlertCount, hasActiveFilters };
}

export function summarizeAlertInventoryRow(
  row: AlertInventoryRow,
  siblings: readonly AlertInventoryRow[],
  knownEvent: boolean
): AlertInventorySummary {
  const conditionSummaries = row.conditions.map((condition) => knownEvent
    ? formatAlertConditionSummary(row.eventType as StreamEventType, condition as AlertCondition)
    : `Saved condition: ${condition.field} ${condition.operator} ${formatRawValue(condition.value)}`
  );
  const priorityGroups = buildAlertPriorityGroups(siblings.map((candidate) => ({
    id: candidate.id,
    enabled: candidate.enabled,
    conditions: candidate.conditions,
    weight: candidate.weight,
    priority: candidate.priority
  })));
  const priorityIndex = priorityGroups.findIndex(({ variationIds }) => variationIds.includes(row.id));
  return {
    conditionSummaries,
    prioritySummary: priorityIndex < 0 ? null : `Priority group ${priorityIndex + 1} of ${priorityGroups.length}`,
    weightSummary: row.kind === "variation"
      ? `Relative weight ${row.weight}; the selected sample's result depends on eligible alerts.`
      : null
  };
}

const statusRank: Readonly<Record<AlertEventGroupStatus, number>> = {
  valid: 0,
  "needs-review": 1,
  warning: 2,
  blocker: 3
};

function highestStatus(statuses: readonly AlertEventGroupStatus[]): AlertEventGroupStatus {
  let highest: AlertEventGroupStatus = "valid";
  for (const status of statuses) {
    if (statusRank[status] > statusRank[highest]) highest = status;
  }
  return highest;
}

function normalizeFilter<T extends string>(value: T | undefined): T | undefined {
  return value === undefined || value === "" || value === "all" ? undefined : value;
}

function includesQuery(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query);
}

function rowIncludesQuery(row: AlertInventoryRow, query: string): boolean {
  return includesQuery(`${row.name} ${row.eventType} ${row.providerKind}`, query);
}

function rowMatchesOther(
  row: AlertInventoryRow,
  group: AlertEventGroup,
  status: AlertEventGroupFilters["status"] | undefined,
  profileId: TargetProfileId | undefined
): boolean {
  const matchesStatus = status === undefined
    || (status === "enabled" ? row.enabled : status === "disabled" ? !row.enabled : group.statusByAlertId[row.id] === status);
  return matchesStatus && (profileId === undefined || row.targetProfileIds.includes(profileId));
}

function formatRawValue(value: AlertInventoryRow["conditions"][number]["value"]): string {
  return Array.isArray(value) ? value.join(" to ") : String(value);
}
