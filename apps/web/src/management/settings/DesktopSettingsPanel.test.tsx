import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DesktopSettingsPanel } from "./DesktopSettingsPanel.js";
afterEach(cleanup);

it("lets keyboard users opt out of closing to tray", async () => {
  function Harness() {
    const [closeToTray, setCloseToTray] = useState(true);
    return <DesktopSettingsPanel closeToTray={closeToTray} disabled={false} onChange={setCloseToTray} />;
  }
  render(<Harness />);
  const checkbox = screen.getByRole("checkbox", { name: "Close window to tray" });
  expect(checkbox).toBeChecked();
  await userEvent.tab();
  expect(checkbox).toHaveFocus();
  await userEvent.keyboard(" ");
  expect(checkbox).not.toBeChecked();
});

it("disables the close policy while a save is pending", () => {
  render(<DesktopSettingsPanel closeToTray disabled onChange={() => { throw new Error("Must not change while saving"); }} />);
  expect(screen.getByRole("checkbox", { name: "Close window to tray" })).toBeDisabled();
});
