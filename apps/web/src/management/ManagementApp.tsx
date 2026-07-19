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
import { DirtyNavigationProvider, useManagementNavigation } from "./navigation/dirty-navigation.js";
import { ManagementNavigation } from "./navigation/ManagementNavigation.js";
import { EventSourcesPage } from "./providers/EventSourcesPage.js";
import { TtsProvidersPage } from "./providers/TtsProvidersPage.js";
import { getManagementRouteDefinition, type ManagementRoute } from "./routing/management-route.js";
import { SettingsPanel } from "./settings/SettingsPanel.js";

export interface ManagementAppProps {
  readonly assetApi: AssetApi;
  readonly managementApi?: ManagementApi | undefined;
}

interface ResolvedManagementAppProps {
  readonly assetApi: AssetApi;
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

function ManagementAppContent({ assetApi, managementApi }: ResolvedManagementAppProps) {
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
        {navigation.route.diagnosticReferenceId === undefined ? null : (
          <p aria-label="Diagnostics context" className="management-diagnostic-context" role="status">
            Opened from Diagnostics. Reference <code>{navigation.route.diagnosticReferenceId}</code>. Review the highlighted configuration and validation state.
          </p>
        )}
        <section aria-label={`${definition.title} content`} className="management-route-content">
          <RouteContent assetApi={assetApi} managementApi={managementApi} onNavigate={navigation.requestNavigation} route={navigation.route} />
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
      return <EventSourcesPage initialProviderId={route.providerId} managementApi={managementApi} openSetupOnLoad={route.setup === "add"} />;
    case "tts-providers":
      return <TtsProvidersPage initialProviderId={route.providerId} managementApi={managementApi} openSetupOnLoad={route.setup === "add"} />;
    case "modules-alerts":
      return <AlertSetsPage initialSetId={route.setId} managementApi={managementApi} onEditAlert={(alert) => onNavigate({ id: "alert-editor", alertId: alert.id, setId: alert.setId, eventType: alert.eventType, targetProfileId: alert.targetProfileIds[0] ?? "landscape" })} />;
    case "alert-editor":
      return route.alertId === undefined ? null : (
        <AlertEditorPage
          alertId={route.alertId}
          assetApi={assetApi}
          managementApi={managementApi}
          onBack={() => onNavigate({ id: "modules-alerts", ...(route.setId === undefined ? {} : { setId: route.setId }) })}
          onOpenAlert={(alertId, targetProfileId) => onNavigate({ id: "alert-editor", alertId, ...(route.setId === undefined ? {} : { setId: route.setId }), targetProfileId })}
          targetProfileId={route.targetProfileId}
        />
      );
    case "assets":
      return <AssetManager assetApi={assetApi} managementApi={managementApi} />;
    case "diagnostics":
      return <DiagnosticsPanel initialReferenceId={route.referenceId} managementApi={managementApi} />;
    case "settings":
      return <SettingsPanel managementApi={managementApi} />;
  }
}
