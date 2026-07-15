export type ManagementRouteId =
  | "home"
  | "event-sources"
  | "tts-providers"
  | "modules-alerts"
  | "assets"
  | "diagnostics"
  | "settings"
  | "legacy-modules"
  | "legacy-overlays"
  | "legacy-playback";

export interface ManagementRoute {
  readonly id: ManagementRouteId;
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
  home: route("home", "Home", "/", "Home", "Complete offline setup and resolve configuration problems."),
  "event-sources": route(
    "event-sources",
    "Event sources",
    "/event-sources",
    "Event sources",
    "Register, validate, and activate services that provide stream events."
  ),
  "tts-providers": route(
    "tts-providers",
    "TTS providers",
    "/tts-providers",
    "TTS providers",
    "Register, test, and activate text-to-speech services."
  ),
  "modules-alerts": route(
    "modules-alerts",
    "Modules",
    "/modules/alerts",
    "Alerts",
    "Configure alert sets, browser-source outputs, and alert behavior.",
    ["Modules", "Alerts"]
  ),
  assets: route("assets", "Assets", "/assets", "Assets", "Review reusable media and where each asset is used."),
  diagnostics: route(
    "diagnostics",
    "Diagnostics",
    "/diagnostics",
    "Diagnostics",
    "Investigate actionable problems, events, and redacted runtime logs."
  ),
  settings: route(
    "settings",
    "Settings",
    "/settings",
    "Settings",
    "Manage local preferences, data, backup, restore, and maintenance."
  ),
  "legacy-modules": route(
    "legacy-modules",
    "Module setup",
    "/legacy/modules",
    "Module setup",
    "Temporary access to the previous module configuration panel.",
    ["Legacy tools", "Module setup"]
  ),
  "legacy-overlays": route(
    "legacy-overlays",
    "Overlay outputs",
    "/legacy/overlays",
    "Overlay outputs",
    "Temporary access to the previous overlay output panel.",
    ["Legacy tools", "Overlay outputs"]
  ),
  "legacy-playback": route(
    "legacy-playback",
    "Playback controls",
    "/legacy/playback",
    "Playback controls",
    "Temporary access to management-side playback controls.",
    ["Legacy tools", "Playback controls"]
  )
};

routeDefinitions["modules-alerts"] = {
  ...routeDefinitions["modules-alerts"],
  childRoutes: [
    {
      ...routeDefinitions["modules-alerts"],
      label: "Alerts",
      childRoutes: []
    }
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

export const managementLegacyRoutes: readonly ManagementRouteDefinition[] = [
  routeDefinitions["legacy-modules"],
  routeDefinitions["legacy-overlays"],
  routeDefinitions["legacy-playback"]
];

const routesByPath = new Map<string, ManagementRouteDefinition>(
  Object.values(routeDefinitions).map((definition) => [definition.path, definition])
);
routesByPath.set("/home", routeDefinitions.home);

export function parseManagementRoute(pathname: string): ManagementRoute {
  const [pathWithoutQuery = "/"] = pathname.split(/[?#]/u, 1);
  const normalizedPath = normalizePath(pathWithoutQuery);
  return { id: routesByPath.get(normalizedPath)?.id ?? "home" };
}

export function formatManagementRoute(routeValue: ManagementRoute): string {
  return routeDefinitions[routeValue.id].path;
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
