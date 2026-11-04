import { isAbsolute, join, relative, resolve } from "node:path";
import type { RuntimeProfileName } from "@stream-jams/server/runtime-profile";
import { appUserModelId, devAppUserModelId } from "./app-identity.js";

export const productionAppName = "Stream Jams";
export const devAppName = "Stream Jams Dev";

export interface DesktopProfileIdentity {
  readonly appName: string;
  readonly appUserModelId: string;
  readonly trayLabel: string;
  readonly isolated: boolean;
}

/** Dev and test share one identity, so they never group with, or take the lock of, the installed app. */
export function desktopProfileIdentity(profile: RuntimeProfileName): DesktopProfileIdentity {
  return profile === "production"
    ? { appName: productionAppName, appUserModelId, trayLabel: "Stream Jams", isolated: false }
    : { appName: devAppName, appUserModelId: devAppUserModelId, trayLabel: "Stream Jams (Dev)", isolated: true };
}

/**
 * Chooses the Electron profile. An explicit override wins (it must be absolute); otherwise
 * dev and test get `%APPDATA%\Stream Jams Dev`. Dev and test refuse the production profile.
 */
export function resolveDesktopUserData(profile: RuntimeProfileName, appData: string, override: string | undefined, platform: NodeJS.Platform = process.platform): string | undefined {
  if (override !== undefined && (override.trim() === "" || !isAbsolute(override))) throw new Error("STREAM_JAMS_DESKTOP_USER_DATA_PATH must be absolute.");
  if (profile === "production") return override;
  const chosen = override ?? join(appData, devAppName);
  const production = join(appData, productionAppName);
  const fold = (value: string) => platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  const offset = relative(fold(production), fold(chosen));
  if (offset === "" || (!offset.startsWith("..") && !isAbsolute(offset))) {
    throw new Error(`The ${profile} profile refuses the production Electron profile (${production}).`);
  }
  return chosen;
}

/**
 * Dev may place the desktop overlay only on the dev display (the Parsec virtual display by
 * default), so dev overlays cannot appear on a monitor production OBS captures. No match means
 * no display: the overlay cannot be enabled. Test runs keep every display, because overlay tests
 * need one on any runner, unless STREAM_JAMS_DEV_DISPLAY_LABEL confines them as well.
 */
export function allowedDesktopDisplays<T extends { readonly label: string }>(displays: readonly T[], profile: RuntimeProfileName, environment: NodeJS.ProcessEnv = process.env): T[] {
  const configured = environment.STREAM_JAMS_DEV_DISPLAY_LABEL?.trim();
  if (profile === "production" || (profile === "test" && !configured)) return [...displays];
  const wanted = (configured || "Parsec").toLowerCase();
  return displays.filter(display => display.label.toLowerCase().includes(wanted));
}
