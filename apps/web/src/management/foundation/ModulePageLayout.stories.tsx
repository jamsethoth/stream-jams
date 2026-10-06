import { Button } from "@mantine/core";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ModuleControls, ModulePageLayout, ModuleSection } from "./ModulePageLayout.js";
import { BrowserSourcesPanel } from "./BrowserSourcesPanel.js";
import { BrowserSourceRow } from "./BrowserSourceRow.js";
import { StatusBadge } from "./StatusBadge.js";

const meta = {
  args: { children: null }, title: "Management/Module composition", component: ModulePageLayout, tags: ["mantine-module-proof"],
  render: function Composition() {
    const [expanded, setExpanded] = useState(false);
    return <ModulePageLayout controls={<ModuleControls status={<StatusBadge label="Module disabled" tone="neutral" />}><Button variant="default">Enable module</Button></ModuleControls>} outputs={<BrowserSourcesPanel detailsId="sample-output-details" expanded={expanded} onToggle={() => setExpanded(value => !value)} readyCount={1} needsSetupCount={1} refreshFailed description="An output can be ready while its saved module is disabled."><BrowserSourceRow label="Window output with a long localized name" ready telemetry="Last known activity is stale" metadata={<span>Window sizing follows the selected surface</span>} guidance="Review the output destination before using it." url={<code>{`http://127.0.0.1:39187/overlay/modules/example/live/********?${"long-safe-metadata=".repeat(18)}`}</code>} actions={<><Button variant="default">Reveal</Button><Button variant="default">Copy</Button><Button color="red">Regenerate</Button></>} /></BrowserSourcesPanel>}><ModuleSection title="Workspace" label="Workspace"><p>Module-specific content retains its own state.</p></ModuleSection></ModulePageLayout>;
  }
} satisfies Meta<typeof ModulePageLayout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const StaleOutputWithDifferentMetadata: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Status refresh failed")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Expand browser sources" }));
    await expect(canvas.getByRole("article")).toHaveTextContent("Window sizing follows the selected surface");
    await expect(canvas.getByRole("article")).not.toHaveTextContent("profile");
  }
};
export const CompactRtl: Story = { ...StaleOutputWithDifferentMetadata, globals: { locale: "ar" }, parameters: { viewport: { defaultViewport: "narrowPhone", options: { narrowPhone: { name: "390px", styles: { width: "390px", height: "844px" } } } } } };
