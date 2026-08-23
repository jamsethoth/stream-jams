import { useMemo, type MouseEvent } from "react";
import type { AssetApi } from "./assets/AssetManager.js";
import { AssetManager } from "./assets/AssetManager.js";
import { AlertSetsPage } from "./alerts/AlertSetsPage.js";
import { AlertSafetyPage } from "./alerts/safety/AlertSafetyPage.js";
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
import {
  getManagementRouteDefinition,
  parseManagementRoute,
  type ManagementRoute
} from "./routing/management-route.js";
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

  function handleInternalLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || !(event.target instanceof Element)
    ) {
      return;
    }

    const anchor = event.target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) {
      return;
    }

    const target = anchor.getAttribute("target");
    if (target !== null && target !== "" && target !== "_self") {
      return;
    }

    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin !== window.location.origin
      || (destination.pathname !== "/manage" && !destination.pathname.startsWith("/manage/"))
    ) {
      return;
    }

    event.preventDefault();
    navigation.requestNavigation(parseManagementRoute(`${destination.pathname}${destination.search}${destination.hash}`));
  }

  return (
    <div className="app-shell" onClickCapture={handleInternalLinkClick}>
      {navigation.route.id === "alert-editor" ? null : <ManagementNavigation activeRoute={navigation.route} onNavigate={navigation.requestNavigation} />}
      <main className={navigation.route.id === "alert-editor" ? "management-main management-main--focused" : "management-main"}>
        {navigation.route.id === "alert-editor" ? null : <PageHeader
          action={(
            <a className="button button--secondary surface-switch-link" href="/operator">
              Open Operator Console
            </a>
          )}
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
        <section
          aria-label={`${definition.title} content`}
          className={navigation.route.id === "alert-editor" ? "management-route-content management-route-content--focused" : "management-route-content"}
        >
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
    case "alert-safety":
      return <AlertSafetyPage managementApi={managementApi} />;
    case "alert-editor":
      return route.alertId === undefined ? null : (
        <AlertEditorPage
          alertId={route.alertId}
          assetApi={assetApi}
          managementApi={managementApi}
          onBack={(loadedSetId) => {
            const setId = loadedSetId ?? route.setId;
            onNavigate({ id: "modules-alerts", ...(setId === undefined ? {} : { setId }) });
          }}
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
