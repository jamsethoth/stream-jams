import { SegmentedControl } from "@mantine/core";
import { useManagementTheme } from "./ManagementPresentationProvider.js";
import { ManagementToast } from "./ManagementToast.js";

export type { ThemePreference } from "./ManagementPresentationProvider.js";

export function ThemeSwitcher() {
  const { preference, error, selectPreference, dismissError } = useManagementTheme();

  return (
    <>
      <fieldset className="theme-switcher">
        <legend>Theme</legend>
        <SegmentedControl
          aria-label="Theme" name="theme-preference" size="xs" value={preference}
          data={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
          onChange={(value) => { if (value === "system" || value === "dark" || value === "light") selectPreference(value); }}
        />
      </fieldset>
      {error === null ? null : <ManagementToast notice={{ tone: "failure", message: error }} onDismiss={dismissError} />}
    </>
  );
}
