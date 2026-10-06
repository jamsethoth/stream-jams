import { useManagementTheme } from "./ManagementPresentationProvider.js";
import { ManagementToast } from "./ManagementToast.js";

export type { ThemePreference } from "./ManagementPresentationProvider.js";

export function ThemeSwitcher() {
  const { preference, error, selectPreference, dismissError } = useManagementTheme();

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
      {error === null ? null : <ManagementToast notice={{ tone: "failure", message: error }} onDismiss={dismissError} />}
    </>
  );
}
