export interface DesktopSettingsPanelProps {
  readonly closeToTray: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

export function DesktopSettingsPanel({ closeToTray, disabled, onChange }: DesktopSettingsPanelProps) {
  return (
    <div>
      <label><input checked={closeToTray} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" /> Close window to tray</label>
      <p>Keep alerts and the local service running when you close the window. Use Quit in the tray to stop Stream Jams. Turn this off to quit when closing the window.</p>
    </div>
  );
}
