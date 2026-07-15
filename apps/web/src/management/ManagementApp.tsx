import { useMemo } from "react";
import type { AssetApi } from "./assets/AssetManager.js";
import { AssetManager } from "./assets/AssetManager.js";
import { AlertSetsPage } from "./alerts/AlertSetsPage.js";
import { AlertEditorPage } from "./alerts/editor/AlertEditorPage.js";
import { DiagnosticsPanel } from "./diagnostics/DiagnosticsPanel.js";
import { PageHeader } from "./foundation/PageHeader.js";
import { StatusBadge } from "./foundation/StatusBadge.js";
import { createHttpManagementApi, type ManagementApi } from "./management-api.js";
import { HomePanel } from "./home/HomePanel.js";
import type { AlertConfigurationApi } from "./modules/alerts/alert-api.js";
import { ModuleManagementPanel } from "./modules/ModuleManagementPanel.js";
import { DirtyNavigationProvider, useManagementNavigation } from "./navigation/dirty-navigation.js";
import { ManagementNavigation } from "./navigation/ManagementNavigation.js";
import { OverlayOutputsPanel } from "./overlays/OverlayOutputsPanel.js";
import { PlaybackPanel } from "./playback/PlaybackPanel.js";
import { EventSourcesPage } from "./providers/EventSourcesPage.js";
import { TtsProvidersPage } from "./providers/TtsProvidersPage.js";
import { getManagementRouteDefinition, type ManagementRoute } from "./routing/management-route.js";
import { SettingsPanel } from "./settings/SettingsPanel.js";

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
      {navigation.route.id === "alert-editor" ? null : <ManagementNavigation activeRoute={navigation.route} onNavigate={navigation.requestNavigation} />}
      <main className={navigation.route.id === "alert-editor" ? "management-main management-main--focused" : "management-main"}>
        {navigation.route.id === "alert-editor" ? null : <PageHeader
          breadcrumbs={definition.breadcrumbs}
          description={definition.description}
          status={<StatusBadge label="Local" tone="positive" />}
          title={definition.title}
        />}
        <section aria-label={`${definition.title} content`} className="management-route-content">
          <RouteContent alertApi={alertApi} assetApi={assetApi} managementApi={managementApi} onNavigate={navigation.requestNavigation} route={navigation.route} />
        </section>
      </main>
      {navigation.guard}
    </div>
  );
}

function RouteContent({
  assetApi,
  managementApi,
  onNavigate,
  route
}: ResolvedManagementAppProps & { readonly onNavigate: (route: ManagementRoute) => void; readonly route: ManagementRoute }) {
  switch (route.id) {
    case "home":
      return <HomePanel managementApi={managementApi} />;
    case "event-sources":
      return <EventSourcesPage managementApi={managementApi} />;
    case "tts-providers":
      return <TtsProvidersPage managementApi={managementApi} />;
    case "modules-alerts":
      return <AlertSetsPage managementApi={managementApi} onEditAlert={(alert) => onNavigate({ id: "alert-editor", alertId: alert.id, setId: alert.setId, eventType: alert.eventType, targetProfileId: alert.targetProfileIds[0] ?? "landscape" })} />;
    case "alert-editor":
      return route.alertId === undefined ? null : (
        <AlertEditorPage
          alertId={route.alertId}
          assetApi={assetApi}
          managementApi={managementApi}
          onBack={() => onNavigate({ id: "modules-alerts" })}
          onOpenAlert={(alertId, targetProfileId) => onNavigate({ id: "alert-editor", alertId, ...(route.setId === undefined ? {} : { setId: route.setId }), targetProfileId })}
          targetProfileId={route.targetProfileId}
        />
      );
    case "assets":
      return <AssetManager assetApi={assetApi} managementApi={managementApi} />;
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
