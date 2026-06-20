import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementNavigation, type ManagementTabId } from "./ManagementNavigation.js";

const meta = {
  title: "Management/Navigation",
  component: ManagementNavigation
} satisfies Meta<typeof ManagementNavigation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InteractiveTabs: Story = {
  args: {
    activeTab: "dashboard",
    onSelect: () => undefined
  },
  render(args) {
    const [activeTab, setActiveTab] = useState<ManagementTabId>(args.activeTab);
    const handleSelect = (tabId: ManagementTabId) => {
      setActiveTab(tabId);
      args.onSelect(tabId);
    };

    return (
      <>
        <ManagementNavigation activeTab={activeTab} onSelect={handleSelect} />
        <div aria-labelledby={`management-tab-${activeTab}`} id={`management-panel-${activeTab}`} role="tabpanel">
          {activeTab} panel
        </div>
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: "Use this to verify tab labels, selected state, and horizontal overflow behavior."
      }
    }
  }
};
