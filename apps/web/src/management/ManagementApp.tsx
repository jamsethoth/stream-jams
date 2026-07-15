import { useMemo } from "react";
import type { AssetApi } from "./assets/AssetManager.js";
import { AssetManager } from "./assets/AssetManager.js";
import { DashboardPanel } from "./dashboard/DashboardPanel.js";
import { DiagnosticsPanel } from "./diagnostics/DiagnosticsPanel.js";
import { PageHeader } from "./foundation/PageHeader.js";
import { StatusBadge } from "./foundation/StatusBadge.js";
import { createHttpManagementApi, type ManagementApi } from "./management-api.js";
import { AlertConfigurationPanel, type AlertConfigurationApi } from "./modules/alerts/AlertConfigurationPanel.js";
import { ModuleManagementPanel } from "./modules/ModuleManagementPanel.js";
import { DirtyNavigationProvider, useManagementNavigation } from "./navigation/dirty-navigation.js";
import { ManagementNavigation } from "./navigation/ManagementNavigation.js";
import { OverlayOutputsPanel } from "./overlays/OverlayOutputsPanel.js";
import { PlaybackPanel } from "./playback/PlaybackPanel.js";
import { getManagementRouteDefinition, type ManagementRoute } from "./routing/management-route.js";
import { SettingsPanel } from "./settings/SettingsPanel.js";
import { TtsPanel } from "./tts/TtsPanel.js";
import { TwitchPanel } from "./twitch/TwitchPanel.js";

export interface ManagementAppProps {
  readonly assetApi: AssetApi;
  readonly alertApi: AlertConfigurationApi;
  readonly managementApi?: ManagementApi | undefined;
}

interface ResolvedManagementAppProps {
  readonly assetApi: AssetApi;
  readonly alertApi: AlertConfigurationApi;
  readonly managementApi: ManagementApi;
}

export function ManagementApp(props: ManagementAppProps) {
  const resolvedManagementApi = useMemo(() => props.managementApi ?? createHttpManagementApi(), [props.managementApi]);
  return (
    <DirtyNavigationProvider>
      <ManagementAppContent {...props} managementApi={resolvedManagementApi} />
    </DirtyNavigationProvider>
  );
}

function ManagementAppContent({ assetApi, alertApi, managementApi }: ResolvedManagementAppProps) {
  const navigation = useManagementNavigation();
  const definition = getManagementRouteDefinition(navigation.route);

  return (
    <div className="app-shell">
      <ManagementNavigation activeRoute={navigation.route} onNavigate={navigation.requestNavigation} />
      <main className="management-main">
        <PageHeader
          breadcrumbs={definition.breadcrumbs}
          description={definition.description}
          status={<StatusBadge label="Local" tone="positive" />}
          title={definition.title}
        />
        <section aria-label={`${definition.title} content`} className="management-route-content">
          <RouteContent alertApi={alertApi} assetApi={assetApi} managementApi={managementApi} route={navigation.route} />
        </section>
      </main>
      {navigation.guard}
    </div>
  );
}

function RouteContent({
  alertApi,
  assetApi,
  managementApi,
  route
}: ResolvedManagementAppProps & { readonly route: ManagementRoute }) {
  switch (route.id) {
    case "home":
      return <DashboardPanel managementApi={managementApi} />;
    case "event-sources":
      return <TwitchPanel managementApi={managementApi} />;
    case "tts-providers":
      return <TtsPanel managementApi={managementApi} />;
    case "modules-alerts":
      return <AlertConfigurationPanel alertApi={alertApi} assetApi={assetApi} />;
    case "assets":
      return <AssetManager assetApi={assetApi} />;
    case "diagnostics":
      return <DiagnosticsPanel managementApi={managementApi} />;
    case "settings":
      return <SettingsPanel managementApi={managementApi} />;
    case "legacy-modules":
      return <ModuleManagementPanel managementApi={managementApi} />;
    case "legacy-overlays":
      return <OverlayOutputsPanel managementApi={managementApi} />;
    case "legacy-playback":
      return <PlaybackPanel managementApi={managementApi} />;
  }
}
