import type { ActionableManagementError } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DestructiveConfirmationDialog } from "./DestructiveConfirmationDialog.js";
import { DirtyNavigationDialog } from "./DirtyNavigationDialog.js";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";
import { MaskedValue } from "./MaskedValue.js";

const exampleError: ActionableManagementError = {
  summary: "Twitch validation failed",
  cause: "The saved authorization expired.",
  nextStep: "Reconnect the Twitch event source and retry validation.",
  severity: "error",
  occurredAt: "2026-07-15T02:00:00.000Z",
  referenceId: "ref-provider-17",
  correction: { label: "Open event source", route: "/manage/event-sources?provider=twitch-main" }
};

const meta = {
  title: "Management/Foundation",
  component: ManagementErrorBanner,
  args: { error: exampleError }
} satisfies Meta<typeof ManagementErrorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ErrorBanner: Story = {};

export const DestructiveConfirmation: Story = {
  render: () => (
    <DestructiveConfirmationDialog
      actionLabel="Regenerate route key"
      confirmText="REGENERATE"
      consequences="Connected browser sources will stop receiving alerts."
      onCancel={() => undefined}
      onConfirm={() => undefined}
      open
      recovery="Update the browser source in OBS with the new URL."
      scope="Landscape live output"
      title="Regenerate this route key?"
    />
  )
};

export const DirtyNavigationGuard: Story = {
  render: () => (
    <DirtyNavigationDialog
      error={null}
      onCancel={() => undefined}
      onDiscard={() => undefined}
      onSave={() => undefined}
      open
      saveAvailable
      summary="Alert layout and timing changes have not been saved."
    />
  )
};

export const MaskedRouteKey: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <MaskedValue
        label="Landscape browser-source URL"
        value="http://127.0.0.1:39187/overlay/modules/alerts/live/example-route-key"
      />
    </div>
  )
};
