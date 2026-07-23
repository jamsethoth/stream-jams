import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagementNavigation } from "./ManagementNavigation.js";

describe("ManagementNavigation", () => {
  it("keeps surface switching out of primary navigation", () => {
    render(<ManagementNavigation activeRoute={{ id: "home" }} onNavigate={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "Open Operator Console" })).not.toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
  });
});
