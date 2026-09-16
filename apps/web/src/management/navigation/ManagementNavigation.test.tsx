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

  it("toggles the compact navigation and restores focus when Escape closes it", async () => {
    const user = userEvent.setup();
    render(<ManagementNavigation activeRoute={{ id: "alert-safety" }} onNavigate={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Safety", { selector: ".management-brand__current" })).toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes only after navigation succeeds so a cancelled dirty transition stays open", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { rerender } = render(<ManagementNavigation activeRoute={{ id: "home" }} onNavigate={onNavigate} />);

    const trigger = screen.getByRole("button", { name: "Navigation" });
    await user.click(trigger);
    await user.click(screen.getByRole("link", { name: "Assets" }));
    expect(onNavigate).toHaveBeenCalledWith({ id: "assets" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    rerender(<ManagementNavigation activeRoute={{ id: "assets" }} onNavigate={onNavigate} />);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
