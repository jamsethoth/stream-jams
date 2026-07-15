import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
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
  parameters: {
    docs: {
      description: {
        story: "Primary sidebar navigation with nested Alerts, temporary legacy adapters, and theme preference."
      }
    }
  }
};
