export type ManagementRouteId =
  | "home"
  | "event-sources"
  | "tts-providers"
  | "modules-alerts"
  | "alert-safety"
  | "alert-editor"
  | "assets"
  | "diagnostics"
  | "settings";

export interface ManagementRoute {
  readonly id: ManagementRouteId;
  readonly alertId?: string;
  readonly setId?: string;
  readonly eventType?: string;
  readonly targetProfileId?: string;
  readonly providerId?: string;
  readonly setup?: "add";
  readonly diagnosticReferenceId?: string;
  readonly referenceId?: string;
  readonly fragment?: string;
}

export interface ManagementRouteDefinition extends ManagementRoute {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly breadcrumbs: readonly string[];
  readonly childRoutes: readonly ManagementRouteDefinition[];
}

const routeDefinitions: Record<ManagementRouteId, ManagementRouteDefinition> = {
  home: route("home", "Home", "/manage", "Home", "Complete offline setup and resolve configuration problems."),
  "event-sources": route(
    "event-sources",
    "Event sources",
    "/manage/event-sources",
    "Event sources",
    "Register, validate, and activate services that provide stream events."
  ),
  "tts-providers": route(
    "tts-providers",
    "TTS providers",
    "/manage/tts-providers",
    "TTS providers",
    "Register, test, and activate text-to-speech services."
  ),
  "modules-alerts": route(
    "modules-alerts",
    "Modules",
    "/manage/modules/alerts",
    "Alerts",
    "Configure alert sets, browser-source outputs, and alert behavior.",
    ["Modules", "Alerts"]
  ),
  "alert-safety": route(
    "alert-safety",
    "Safety",
    "/manage/modules/alerts/safety",
    "Alert safety",
    "Configure shared rendered-text and text-to-speech moderation.",
    ["Modules", "Alerts", "Safety"]
  ),
  "alert-editor": route(
    "alert-editor",
    "Alert editor",
    "/manage/modules/alerts/editor/:alertId",
    "Alert editor",
    "Edit alert content and target-profile layouts.",
    ["Modules", "Alerts", "Alert editor"]
  ),
  assets: route("assets", "Assets", "/manage/assets", "Assets", "Review reusable media and where each asset is used."),
  diagnostics: route(
    "diagnostics",
    "Diagnostics",
    "/manage/diagnostics",
    "Diagnostics",
    "Investigate actionable problems, events, and redacted runtime logs."
  ),
  settings: route(
    "settings",
    "Settings",
    "/manage/settings",
    "Settings",
    "Manage local preferences, data, backup, restore, and maintenance."
  )
};

routeDefinitions["modules-alerts"] = {
  ...routeDefinitions["modules-alerts"],
  childRoutes: [
    {
      ...routeDefinitions["modules-alerts"],
      label: "Alerts",
      childRoutes: []
    },
    routeDefinitions["alert-safety"]
  ]
};

export const managementPrimaryRoutes: readonly ManagementRouteDefinition[] = [
  routeDefinitions.home,
  routeDefinitions["event-sources"],
  routeDefinitions["tts-providers"],
  routeDefinitions["modules-alerts"],
  routeDefinitions.assets,
  routeDefinitions.diagnostics,
  routeDefinitions.settings
];

const routesByPath = new Map<string, ManagementRouteDefinition>(
  Object.values(routeDefinitions).map((definition) => [definition.path, definition])
);
routesByPath.set("/", routeDefinitions.home);
routesByPath.set("/home", routeDefinitions.home);

export function parseManagementRoute(pathname: string): ManagementRoute {
  const fragmentIndex = pathname.indexOf("#");
  const pathAndQuery = fragmentIndex === -1 ? pathname : pathname.slice(0, fragmentIndex);
  const fragmentValue = fragmentIndex === -1 ? "" : pathname.slice(fragmentIndex + 1);
  const fragment = fragmentValue === "" ? undefined : fragmentValue;
  const queryIndex = pathAndQuery.indexOf("?");
  const pathWithoutQuery = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const normalizedPath = normalizePath(pathWithoutQuery);
  const search = new URLSearchParams(queryIndex === -1 ? "" : pathAndQuery.slice(queryIndex + 1));
  const diagnosticReferenceId = search.get("diagnostic") || undefined;
  const editorMatch = /^\/manage\/modules\/alerts\/editor\/([^/]+)$/u.exec(normalizedPath);

  if (editorMatch?.[1] !== undefined) {
    const alertId = decodePathSegment(editorMatch[1]);
    if (alertId === null) {
      return { id: "home" };
    }

    const setId = search.get("set") || undefined;
    const eventType = search.get("event") || undefined;
    const targetProfileId = search.get("profile") || undefined;
    return {
      id: "alert-editor",
      alertId,
      ...(setId === undefined ? {} : { setId }),
      ...(eventType === undefined ? {} : { eventType }),
      ...(targetProfileId === undefined ? {} : { targetProfileId }),
      ...(diagnosticReferenceId === undefined ? {} : { diagnosticReferenceId }),
      ...(fragment === undefined ? {} : { fragment })
    };
  }

  const id = routesByPath.get(normalizedPath)?.id ?? "home";
  const providerId = search.get("provider") || undefined;
  const setId = search.get("set") || undefined;
  const referenceId = search.get("reference") || undefined;
  const setup = search.get("setup") === "add" ? "add" as const : undefined;
  return {
    id,
    ...(id === "event-sources" || id === "tts-providers" ? {
      ...(providerId === undefined ? {} : { providerId }),
      ...(setup === undefined ? {} : { setup })
    } : {}),
    ...(id === "modules-alerts" ? {
      ...(setId === undefined ? {} : { setId })
    } : {}),
    ...(id === "diagnostics" && referenceId !== undefined ? { referenceId } : {}),
    ...(diagnosticReferenceId === undefined ? {} : { diagnosticReferenceId }),
    ...(fragment === undefined ? {} : { fragment })
  };
}

export function formatManagementRoute(routeValue: ManagementRoute): string {
  const search = new URLSearchParams();
  if (routeValue.setId !== undefined) search.set("set", routeValue.setId);
  if (routeValue.eventType !== undefined) search.set("event", routeValue.eventType);
  if (routeValue.targetProfileId !== undefined) search.set("profile", routeValue.targetProfileId);
  if (routeValue.providerId !== undefined) search.set("provider", routeValue.providerId);
  if (routeValue.setup !== undefined) search.set("setup", routeValue.setup);
  if (routeValue.diagnosticReferenceId !== undefined) search.set("diagnostic", routeValue.diagnosticReferenceId);
  if (routeValue.referenceId !== undefined) search.set("reference", routeValue.referenceId);
  const query = search.toString();
  const path = routeValue.id === "alert-editor" && routeValue.alertId !== undefined
    ? routeDefinitions[routeValue.id].path.replace(":alertId", encodeURIComponent(routeValue.alertId))
    : routeDefinitions[routeValue.id].path;
  const pathAndQuery = query === "" ? path : `${path}?${query}`;
  return routeValue.fragment === undefined ? pathAndQuery : `${pathAndQuery}#${routeValue.fragment}`;
}

export function getManagementRouteDefinition(routeValue: ManagementRoute): ManagementRouteDefinition {
  return routeDefinitions[routeValue.id];
}

function route(
  id: ManagementRouteId,
  label: string,
  path: string,
  title: string,
  description: string,
  breadcrumbs: readonly string[] = [label]
): ManagementRouteDefinition {
  return { id, label, path, title, description, breadcrumbs, childRoutes: [] };
}

function normalizePath(pathname: string): string {
  if (pathname === "" || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
