import { useEffect, useState } from "react";
import { ManagementToast } from "./ManagementToast.js";

export type ThemePreference = "system" | "dark" | "light";
const storageKey = "stream-jams-theme";

export function ThemeSwitcher() {
  const initial = readThemePreference();
  const [preference, setPreference] = useState<ThemePreference>(initial.preference);
  const [error, setError] = useState(initial.error);

  useEffect(() => {
    document.documentElement.dataset.theme = preference;
  }, [preference]);

  function selectPreference(nextPreference: ThemePreference) {
    setPreference(nextPreference);
    document.documentElement.dataset.theme = nextPreference;
    try {
      window.localStorage.setItem(storageKey, nextPreference);
      setError(null);
    } catch {
      setError("Theme preference could not be saved for the next session.");
    }
  }

  return (
    <>
      <fieldset className="theme-switcher">
        <legend>Theme</legend>
        <div className="theme-switcher__segments">
          {(["system", "dark", "light"] as const).map((value) => (
            <label key={value}>
              <input
                checked={preference === value}
                name="theme-preference"
                onChange={() => selectPreference(value)}
                type="radio"
                value={value}
              />
              <span>{value[0]?.toUpperCase()}{value.slice(1)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error === null ? null : <ManagementToast notice={{ tone: "failure", message: error }} onDismiss={() => setError(null)} />}
    </>
  );
}

function readThemePreference(): { readonly preference: ThemePreference; readonly error: string | null } {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return {
      preference: stored === "dark" || stored === "light" ? stored : "system",
      error: null
    };
  } catch {
    return { preference: "system", error: "Theme preference storage is unavailable in this browser session." };
  }
}
