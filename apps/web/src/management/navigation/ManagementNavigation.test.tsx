import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementNavigation } from "./ManagementNavigation.js";

afterEach(cleanup);

describe("ManagementNavigation", () => {
  it("keeps surface switching out of primary navigation", () => {
    render(<ManagementNavigation activeRoute={{ id: "home" }} onNavigate={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "Open Operator Console" })).not.toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
  });

  it("selects nested alert safety navigation without selecting Alerts", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ManagementNavigation activeRoute={{ id: "alert-safety" }} onNavigate={onNavigate} />);

    expect(screen.getByRole("link", { name: "Safety" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Alerts" })).not.toHaveAttribute("aria-current");
    await user.click(screen.getByRole("link", { name: "Safety" }));
    expect(onNavigate).toHaveBeenCalledWith({ id: "alert-safety" });
  });
});
