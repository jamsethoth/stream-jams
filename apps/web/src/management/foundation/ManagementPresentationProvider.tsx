import "@mantine/core/styles.layer.css";
import "./management-mantine.css";
import { DirectionProvider, MantineProvider, useDirection, type MantineColorSchemeManager } from "@mantine/core";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { managementCssVariables, managementTheme } from "./management-theme.js";

export type ThemePreference = "system" | "dark" | "light";
export const themeStorageKey = "stream-jams-theme";
interface ThemeState {
  readonly preference: ThemePreference;
  readonly error: string | null;
  readonly selectPreference: (preference: ThemePreference) => void;
  readonly dismissError: () => void;
}
const ThemeContext = createContext<ThemeState | null>(null);
// Mantine owns no persistence. Its defaults otherwise read a second storage key
// even when forceColorScheme is provided.
const memorySchemeManager: MantineColorSchemeManager = {
  get: (value) => value, set() {}, clear() {}, subscribe() {}, unsubscribe() {}
};
function readPreference(): { preference: ThemePreference; error: string | null } {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return { preference: value === "dark" || value === "light" ? value : "system", error: null };
  }
  // error-provenance: allow expected -- bounded browser-storage fallback
  catch { return { preference: "system", error: "Theme preference storage is unavailable in this browser session." }; }
}
export function useManagementTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === null) throw new Error("Management theme controls require ManagementPresentationProvider.");
  return state;
}
function DirectionSync({ direction }: { readonly direction: "ltr" | "rtl" }) {
  const { setDirection } = useDirection();
  useEffect(() => setDirection(direction), [direction, setDirection]);
  return null;
}
export function ManagementPresentationProvider({ children }: { readonly children: ReactNode }) {
  const [initial] = useState(readPreference);
  const [preference, setPreference] = useState(initial.preference);
  const [error, setError] = useState(initial.error);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [direction, setDirection] = useState<"ltr" | "rtl">(() => document.documentElement.dir === "rtl" ? "rtl" : "ltr");
  const resolvedScheme = preference === "system" ? systemDark ? "dark" : "light" : preference;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preference;
  }, [preference]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media?.matches ?? false);
    media?.addEventListener("change", change);
    change();
    const observer = new MutationObserver(() => setDirection(document.documentElement.dir === "rtl" ? "rtl" : "ltr"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => { media?.removeEventListener("change", change); observer.disconnect(); };
  }, []);
  const state = useMemo<ThemeState>(() => ({
    preference, error, dismissError: () => setError(null),
    selectPreference(next) {
      setPreference(next);
      try { window.localStorage.setItem(themeStorageKey, next); setError(null); }
      // error-provenance: allow expected -- bounded browser-storage feedback
      catch { setError("Theme preference could not be saved for the next session."); }
    }
  }), [preference, error]);
  return <ThemeContext value={state}>
    <DirectionProvider initialDirection={direction} detectDirection={false}>
      <DirectionSync direction={direction} />
      <MantineProvider theme={managementTheme} forceColorScheme={resolvedScheme} colorSchemeManager={memorySchemeManager} cssVariablesResolver={managementCssVariables}>
        {children}
      </MantineProvider>
    </DirectionProvider>
  </ThemeContext>;
}
