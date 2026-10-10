import { Checkbox } from "@mantine/core";
export interface DesktopSettingsPanelProps {
  readonly closeToTray: boolean;
  readonly gpuAcceleration: boolean;
  readonly disabled: boolean;
  readonly onCloseToTrayChange: (value: boolean) => void;
  readonly onGpuAccelerationChange: (value: boolean) => void;
}

export function DesktopSettingsPanel({ closeToTray, gpuAcceleration, disabled, onCloseToTrayChange, onGpuAccelerationChange }: DesktopSettingsPanelProps) {
  return (
    <div className="desktop-settings">
      <Checkbox checked={closeToTray} disabled={disabled} onChange={(event) => onCloseToTrayChange(event.currentTarget.checked)} label="Close window to tray" description="Keep alerts and the local service running when you close the window. Use Quit in the tray to stop Stream Jams. Turn this off to quit when closing the window." />
      <Checkbox checked={gpuAcceleration} disabled={disabled} onChange={(event) => onGpuAccelerationChange(event.currentTarget.checked)} label="Use GPU acceleration" description="Smoother video with less CPU. Turn this off if Stream Jams keeps running after you quit. Takes effect the next time Stream Jams starts." />
    </div>
  );
}
