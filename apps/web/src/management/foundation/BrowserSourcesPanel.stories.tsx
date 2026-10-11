import { BrowserSourceRow } from "./BrowserSourceRow.js";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { BrowserSourceSetupNotice, BrowserSourcesPanel } from "./BrowserSourcesPanel.js";

const meta = {
  title: "Management/Browser Sources",
  component: BrowserSourcesPanel,
  tags: ["mantine-module-proof", "browser-sources"],
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

export const AuthoritativeDimensions: Story = {
  tags: ["output-canvas"],
  args: { expanded: true, children: <BrowserSourceRow label="Music Landscape" ready={false} canvas={{ width: 777, height: 211 }}
    telemetry="Not listening. No connection recorded." url={<p>Create a URL before adding this profile to OBS.</p>} actions={null} /> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("article")).toHaveTextContent("777 x 211");
    await expect(within(canvasElement).getByRole("article")).toHaveTextContent("Needs setup");
  }
};

/** A module page renders one OBS setup notice above all of its sources instead of repeating it per row. */
export const SingleSetupNotice: Story = {
  tags: ["output-canvas"],
  args: { expanded: true, children: <>
    <BrowserSourceSetupNotice sizesShown />
    <BrowserSourceRow label="Landscape" ready canvas={{ width: 1920, height: 1080 }} telemetry="Listening now" url={<code>http://127.0.0.1:39187/overlay/********</code>} actions={null} />
    <BrowserSourceRow label="Vertical" ready canvas={{ width: 1080, height: 1920 }} telemetry="Not listening. No connection recorded." url={<code>http://127.0.0.1:39187/overlay/********</code>} actions={null} />
  </> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("note")).toHaveLength(1);
    await expect(canvas.getByRole("note")).toHaveTextContent("Delete any old test or unified sources");
    await expect(canvas.getAllByRole("article")).toHaveLength(2);
  }
};

/** Sizes have not loaded yet, so the notice does not refer to dimensions that are absent. */
export const SetupNoticeSizesPending: Story = {
  args: { expanded: true, children: <>
    <BrowserSourceSetupNotice sizesShown={false} />
    <BrowserSourceRow label="Landscape" ready={false} telemetry="Not listening. No connection recorded." url={<p>Create a URL before adding this profile to OBS.</p>} actions={null} />
  </> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("note")).toHaveTextContent("appear beside the URL once the saved size loads");
  }
};
