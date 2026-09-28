import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementErrorFallback } from "./ManagementErrorBoundary.js";

const meta = {
  title: "Management/Error recovery",
  component: ManagementErrorFallback,
  args: {
    referenceId: "err_management_story",
    onReload: () => undefined
  }
} satisfies Meta<typeof ManagementErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RenderFailure: Story = {};

export const LongReferenceWraps: Story = {
  args: { referenceId: `err_${"long-reference-".repeat(18)}` }
};

export const ReportingUnavailable: Story = {
  args: { referenceId: "err_report_endpoint_unavailable" },
  parameters: {
    docs: {
      description: {
        story: "The recovery UI remains usable when the background diagnostic request fails; it keeps the locally generated reference and does not retry recursively."
      }
    }
  }
};
