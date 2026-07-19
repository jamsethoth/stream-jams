import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DiagnosticsWorkspaceView } from "@stream-jams/core";
import { expect, userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";

const meta = { title: "Management/Diagnostics/Workspace", component: DiagnosticsPanel } satisfies Meta<typeof DiagnosticsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveProblems: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => diagnosticsWorkspace() }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { name: "Error · Providers" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open event sources" })).toHaveAttribute("href", expect.stringContaining("diagnostic=ref-provider-1"));
    await expect(canvas.getByRole("button", { name: "Copy error JSON" })).toBeVisible();
  }
};

export const NoProblems: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => ({ ...diagnosticsWorkspace(), problems: [] }) }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No active problems")).toBeVisible();
  }
};

export const EventDetail: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => diagnosticsWorkspace() }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Open problems" });
    await userEvent.click(canvas.getByRole("tab", { name: /Events/ }));
    await userEvent.click(canvas.getByRole("button", { name: "subscription" }));
    await expect(canvas.getByLabelText("Event detail")).toHaveTextContent("Alert rendering failed");
  }
};

export const RawLogDetail: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => diagnosticsWorkspace() }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Open problems" });
    await userEvent.click(canvas.getByRole("tab", { name: /Raw logs/ }));
    await userEvent.click(canvas.getByRole("button", { name: /ref-runtime-2/ }));
    await expect(canvas.getByLabelText("Raw log detail")).toHaveTextContent("[REDACTED]");
    await expect(canvas.getByRole("button", { name: "Copy sanitized event" })).toBeVisible();
  }
};

export const ExportFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getDiagnosticsWorkspace: async () => diagnosticsWorkspace(),
      exportDiagnostics: async () => {
        throw new Error("The diagnostics archive could not be written. (DIAGNOSTICS_EXPORT_FAILED, ref-export-story)");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Open problems" });
    await userEvent.click(canvas.getByRole("button", { name: "Export support bundle" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("ref-export-story");
    await expect(alert).toHaveTextContent("Retry once");
  }
};

function diagnosticsWorkspace(): DiagnosticsWorkspaceView {
  return {
    problems: [
      {
        id: "problem-provider",
        area: "providers",
        summary: "Event source disconnected",
        cause: "Twitch WebSocket closed unexpectedly.",
        nextStep: "Reconnect the active event source.",
        severity: "error",
        occurredAt: "2026-07-15T22:42:18.000Z",
        referenceId: "ref-provider-1",
        correction: { label: "Open event sources", route: "/manage/event-sources?diagnostic=ref-provider-1" }
      },
      {
        id: "problem-output",
        area: "outputs",
        summary: "Send test blocked",
        cause: "No browser-source client is connected.",
        nextStep: "Reconnect the browser-source output.",
        severity: "warning",
        occurredAt: "2026-07-15T22:41:18.000Z",
        referenceId: "ref-output-1",
        correction: { label: "Open browser sources", route: "/manage/modules/alerts?diagnostic=ref-output-1#browser-sources" }
      }
    ],
    events: [
      {
        id: "event-1",
        providerId: "twitch",
        providerKind: "twitch",
        eventType: "follow",
        occurredAt: "2026-07-15T22:42:13.000Z",
        outcome: "processed",
        test: false,
        referenceId: "ref-event-1",
        processingId: "processing-1",
        actorDisplayName: "Follower",
        alertIds: ["alert-follow"],
        matchedRuleIds: ["rule-follow"],
        playbackStatus: "completed",
        errorMessage: null,
        sanitizedPayload: { userName: "Follower" },
        correction: { label: "Open alert", route: "/manage/modules/alerts/editor/alert-follow?diagnostic=ref-event-1" }
      },
      {
        id: "event-2",
        providerId: "twitch",
        providerKind: "twitch",
        eventType: "subscription",
        occurredAt: "2026-07-15T22:28:07.000Z",
        outcome: "failed",
        test: false,
        referenceId: "ref-event-2",
        processingId: "processing-2",
        actorDisplayName: "viewer42",
        alertIds: ["alert-sub"],
        matchedRuleIds: ["rule-sub"],
        playbackStatus: "failed",
        errorMessage: "Alert rendering failed.",
        sanitizedPayload: { userName: "viewer42", authorization: "[REDACTED]" },
        correction: { label: "Open alert", route: "/manage/modules/alerts/editor/alert-sub?diagnostic=ref-event-2" }
      }
    ],
    rawLogs: [
      {
        id: "log-1",
        timestamp: "2026-07-15T22:42:18.000Z",
        level: "ERROR",
        component: "twitch",
        event: "provider.disconnected",
        referenceId: "ref-runtime-1",
        processingId: null,
        message: "Twitch EventSub socket closed.",
        data: { authorization: "[REDACTED]" },
        correction: { label: "Open event sources", route: "/manage/event-sources?diagnostic=ref-runtime-1" }
      },
      {
        id: "log-2",
        timestamp: "2026-07-15T22:31:44.000Z",
        level: "ERROR",
        component: "overlay",
        event: "test.blocked",
        referenceId: "ref-runtime-2",
        processingId: "processing-2",
        message: "Send test blocked because no client is connected.",
        data: { routeKey: "[REDACTED]" },
        correction: { label: "Open browser sources", route: "/manage/modules/alerts?diagnostic=ref-runtime-2#browser-sources" }
      }
    ]
  };
}
