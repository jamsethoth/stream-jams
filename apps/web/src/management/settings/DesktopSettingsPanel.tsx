export interface DesktopSettingsPanelProps {
  readonly closeToTray: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

export function DesktopSettingsPanel({ closeToTray, disabled, onChange }: DesktopSettingsPanelProps) {
  return (
    <div className="desktop-settings">
      <label className="desktop-settings__checkbox-label"><input checked={closeToTray} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" /><span>Close window to tray</span></label>
      <p>Keep alerts and the local service running when you close the window. Use Quit in the tray to stop Stream Jams. Turn this off to quit when closing the window.</p>
    </div>
  );
}
