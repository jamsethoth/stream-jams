import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { PageHeader } from "./PageHeader.js";
import { StatusBadge } from "./StatusBadge.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";

const meta = {
  title: "Management/Foundation/Shell controls",
  component: PageHeader,
  tags: ["mantine-stage6a"],
  args: { title: "Alert safety", description: "Review the shared policy before changing live alert text.", breadcrumbs: ["Modules", "Alerts", "Safety"] }
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThemeAndBreadcrumbs: Story = {
  render: args => <><PageHeader {...args} status={<StatusBadge label="Local" tone="positive" />} /><ThemeSwitcher /></>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" });
    await expect(within(breadcrumb).getAllByRole("listitem")).toHaveLength(3);
    await expect(within(breadcrumb).getByText("Safety")).toHaveAttribute("aria-current", "page");
    await userEvent.click(canvas.getByRole("radio", { name: "Dark" }));
    await expect(canvas.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.click(canvas.getByRole("radio", { name: "System" }));
    await expect(canvas.getByRole("radio", { name: "System" })).toBeChecked();
  }
};
