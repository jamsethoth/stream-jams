import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { BrowserSourcesPanel } from "./BrowserSourcesPanel.js";

const meta = {
  title: "Management/Browser Sources",
  component: BrowserSourcesPanel,
  tags: ["browser-sources"],
  args: { detailsId: "example-browser-sources", expanded: false, onToggle: () => undefined, readyCount: 1, needsSetupCount: 1, children: <p>Source setup controls appear here.</p> },
  render: function Interactive(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return <BrowserSourcesPanel {...args} expanded={expanded} onToggle={() => setExpanded(current => !current)} />;
  }
} satisfies Meta<typeof BrowserSourcesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Expand browser sources" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(canvas.getByText("Source setup controls appear here.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Collapse browser sources" }));
    await expect(canvas.queryByText("Source setup controls appear here.")).not.toBeInTheDocument();
  }
};
export const Expanded: Story = { args: { expanded: true } };
export const RefreshFailure: Story = { args: { refreshFailed: true } };
export const Empty: Story = { args: { readyCount: 0, needsSetupCount: 0 } };
export const Narrow: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
