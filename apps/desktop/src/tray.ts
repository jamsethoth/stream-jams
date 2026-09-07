import { resolve } from "node:path";
import { Menu, Tray } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { ServiceSnapshot } from "./service-supervisor.js";

export interface TrayActions { open(): void; mute(muted: boolean): void; quit(): void }

export function trayTemplate(actions: TrayActions, snapshot: ServiceSnapshot | null): MenuItemConstructorOptions[] {
  return [
    { label: "Open Stream Jams", click: actions.open },
    { label: snapshot?.muted ? "Unmute alerts" : "Mute alerts", enabled: snapshot !== null, click: () => actions.mute(!snapshot?.muted) },
    { type: "separator" },
    { label: "Quit", click: actions.quit }
  ];
}

export function createTray(actions: TrayActions) {
  const tray = new Tray(resolve(import.meta.dirname, "../assets/tray.ico"));
  tray.setToolTip("Stream Jams");
  tray.on("double-click", actions.open);
  return {
    tray,
    update(snapshot: ServiceSnapshot | null) {
      tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(actions, snapshot)));
    }
  };
}
