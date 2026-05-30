export type ManagementTabId = "dashboard" | "modules" | "overlays" | "playback" | "settings" | "alerts" | "assets";

export interface ManagementTab {
  readonly id: ManagementTabId;
  readonly label: string;
}

export const managementTabs: readonly ManagementTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "modules", label: "Modules" },
  { id: "overlays", label: "Overlays" },
  { id: "playback", label: "Playback" },
  { id: "settings", label: "Settings" },
  { id: "alerts", label: "Alerts" },
  { id: "assets", label: "Assets" }
];

export interface ManagementNavigationProps {
  readonly activeTab: ManagementTabId;
  readonly onSelect: (tabId: ManagementTabId) => void;
}

export function ManagementNavigation({ activeTab, onSelect }: ManagementNavigationProps) {
  return (
    <nav className="management-nav" aria-label="Management sections">
      <div role="tablist" aria-label="Management sections">
        {managementTabs.map((tab) => (
          <button
            aria-controls={`management-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className="management-nav__tab"
            id={`management-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
