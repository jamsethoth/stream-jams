import { renderManagement as render } from "../../test-support/render-management.js";
import { useState } from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DesktopSettingsPanel } from "./DesktopSettingsPanel.js";
afterEach(cleanup);

it("lets keyboard users opt out of closing to tray", async () => {
  function Harness() {
    const [closeToTray, setCloseToTray] = useState(true);
    return <DesktopSettingsPanel closeToTray={closeToTray} gpuAcceleration disabled={false} onCloseToTrayChange={setCloseToTray} onGpuAccelerationChange={() => { throw new Error("GPU must not change"); }} />;
  }
  render(<Harness />);
  const checkbox = screen.getByRole("checkbox", { name: "Close window to tray" });
  expect(checkbox).toBeChecked();
  await userEvent.tab();
  expect(checkbox).toHaveFocus();
  await userEvent.keyboard(" ");
  expect(checkbox).not.toBeChecked();
});

it("lets keyboard users turn GPU acceleration off independently", async () => {
  function Harness() {
    const [gpuAcceleration, setGpuAcceleration] = useState(true);
    return <DesktopSettingsPanel closeToTray gpuAcceleration={gpuAcceleration} disabled={false} onCloseToTrayChange={() => { throw new Error("Close policy must not change"); }} onGpuAccelerationChange={setGpuAcceleration} />;
  }
  render(<Harness />);
  const checkbox = screen.getByRole("checkbox", { name: "Use GPU acceleration" });
  expect(checkbox).toBeChecked();
  expect(checkbox).toHaveAccessibleDescription(/Takes effect the next time Stream Jams starts\./);
  await userEvent.tab();
  await userEvent.tab();
  expect(checkbox).toHaveFocus();
  await userEvent.keyboard(" ");
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Close window to tray" })).toBeChecked();
});

it("disables both desktop settings while a save is pending", () => {
  const fail = () => { throw new Error("Must not change while saving"); };
  render(<DesktopSettingsPanel closeToTray gpuAcceleration disabled onCloseToTrayChange={fail} onGpuAccelerationChange={fail} />);
  expect(screen.getByRole("checkbox", { name: "Close window to tray" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Use GPU acceleration" })).toBeDisabled();
});
