import { resolve } from "node:path";
import { Menu, nativeImage, Tray } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { ServiceSnapshot } from "./service-supervisor.js";

export interface TrayActions { open(): void; mute(muted: boolean): void; quit(): void }
export interface TrayIdentity { readonly label: string; readonly badge: boolean }

export function trayTemplate(actions: TrayActions, snapshot: ServiceSnapshot | null): MenuItemConstructorOptions[] {
  return [
    { label: "Open Stream Jams", click: actions.open },
    { label: snapshot?.muted ? "Unmute Alerts and Effects" : "Mute Alerts and Effects", enabled: snapshot !== null, click: () => actions.mute(!snapshot?.muted) },
    { type: "separator" },
    { label: "Quit", click: actions.quit }
  ];
}

/** Paints an opaque orange square over the bottom-right quarter of a BGRA bitmap, marking a dev tray icon. */
export function paintDevBadge(bitmap: Buffer, width: number, height: number): Buffer {
  const painted = Buffer.from(bitmap);
  for (let y = Math.floor(height / 2); y < height; y++) {
    for (let x = Math.floor(width / 2); x < width; x++) {
      const offset = (y * width + x) * 4;
      painted[offset] = 0x00; painted[offset + 1] = 0x8c; painted[offset + 2] = 0xff; painted[offset + 3] = 0xff;
    }
  }
  return painted;
}

export function createTray(actions: TrayActions, identity: TrayIdentity = { label: "Stream Jams", badge: false }) {
  const icon = nativeImage.createFromPath(resolve(import.meta.dirname, "../assets/tray.ico"));
  const { width, height } = icon.getSize();
  const tray = new Tray(identity.badge ? nativeImage.createFromBitmap(paintDevBadge(icon.toBitmap(), width, height), { width, height }) : icon);
  tray.setToolTip(identity.label);
  tray.on("double-click", actions.open);
  return {
    tray,
    update(snapshot: ServiceSnapshot | null) {
      tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(actions, snapshot)));
    }
  };
}
