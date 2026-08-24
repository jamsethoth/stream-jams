import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { ManagementRoute } from "../routing/management-route.js";
import { ManagementNavigation } from "./ManagementNavigation.js";

const meta = {
  title: "Management/Navigation",
  component: ManagementNavigation
} satisfies Meta<typeof ManagementNavigation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sidebar: Story = {
  args: {
    activeRoute: { id: "home" },
    onNavigate: () => undefined
  },
  render(args) {
    const [activeRoute, setActiveRoute] = useState<ManagementRoute>(args.activeRoute);
    const handleNavigate = (route: ManagementRoute) => {
      setActiveRoute(route);
      args.onNavigate(route);
    };

    return <ManagementNavigation activeRoute={activeRoute} onNavigate={handleNavigate} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(canvas.queryByRole("navigation", { name: "Legacy tools" })).not.toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story: "Primary setup and configuration navigation with nested Alerts."
      }
    }
  }
};

export const AlertSafetySelected: Story = {
  args: {
    activeRoute: { id: "alert-safety" },
    onNavigate: () => undefined
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "Safety" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: "Alerts" })).not.toHaveAttribute("aria-current");
  }
};
