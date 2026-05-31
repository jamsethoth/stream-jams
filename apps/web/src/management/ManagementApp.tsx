import { useMemo, useState } from "react";
import type { AssetApi } from "./assets/AssetManager.js";
import { AssetManager } from "./assets/AssetManager.js";
import { DashboardPanel } from "./dashboard/DashboardPanel.js";
import { DiagnosticsPanel } from "./diagnostics/DiagnosticsPanel.js";
import { createHttpManagementApi, type ManagementApi } from "./management-api.js";
import { AlertConfigurationPanel, type AlertConfigurationApi } from "./modules/alerts/AlertConfigurationPanel.js";
import { ModuleManagementPanel } from "./modules/ModuleManagementPanel.js";
import { ManagementNavigation, type ManagementTabId } from "./navigation/ManagementNavigation.js";
import { OverlayOutputsPanel } from "./overlays/OverlayOutputsPanel.js";
import { PlaybackPanel } from "./playback/PlaybackPanel.js";
import { SettingsPanel } from "./settings/SettingsPanel.js";
import { TtsPanel } from "./tts/TtsPanel.js";
import { TwitchPanel } from "./twitch/TwitchPanel.js";

export interface ManagementAppProps {
  readonly assetApi: AssetApi;
  readonly alertApi: AlertConfigurationApi;
  readonly managementApi?: ManagementApi | undefined;
}

export function ManagementApp({ assetApi, alertApi, managementApi }: ManagementAppProps) {
  const resolvedManagementApi = useMemo(() => managementApi ?? createHttpManagementApi(), [managementApi]);
  const [activeTab, setActiveTab] = useState<ManagementTabId>("dashboard");

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Stream Jams</h1>
          <p>Local-first stream management shell.</p>
        </div>
      </header>
      <div className="management-workspace">
        <ManagementNavigation activeTab={activeTab} onSelect={setActiveTab} />
        <div
          aria-labelledby={`management-tab-${activeTab}`}
          className="management-tab-panel"
          id={`management-panel-${activeTab}`}
          role="tabpanel"
        >
          {activeTab === "dashboard" ? <DashboardPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "twitch" ? <TwitchPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "diagnostics" ? <DiagnosticsPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "modules" ? <ModuleManagementPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "overlays" ? <OverlayOutputsPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "playback" ? <PlaybackPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "tts" ? <TtsPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "settings" ? <SettingsPanel managementApi={resolvedManagementApi} /> : null}
          {activeTab === "alerts" ? <AlertConfigurationPanel alertApi={alertApi} /> : null}
          {activeTab === "assets" ? <AssetManager assetApi={assetApi} /> : null}
        </div>
      </div>
    </main>
  );
}
