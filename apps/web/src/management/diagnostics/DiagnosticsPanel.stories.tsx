import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DiagnosticsWorkspaceView, EventBusActivityView } from "@stream-jams/core";
import { expect, userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";

const meta = { tags: ["mantine-stage6b-diagnostics", "mantine-stage6b", "mantine-feedback-tabs"], title: "Management/Diagnostics/Workspace", component: DiagnosticsPanel } satisfies Meta<typeof DiagnosticsPanel>;
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

export const AutomaticKeyboardTabs: Story = {
  args: ActiveProblems.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const problems = await canvas.findByRole("tab", { name: /Problems/ });
    await canvas.findByRole("heading", { name: "Open problems" });
    await userEvent.click(problems);
    await userEvent.keyboard("{End}");
    const logs = canvas.getByRole("tab", { name: /Raw logs/ });
    await expect(logs).toHaveFocus();
    await expect(logs).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", logs.id);
    await expect(canvas.queryByRole("button", { name: "Copy error JSON" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Home}");
    await expect(problems).toHaveFocus();
    await expect(problems).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: /Events/ })).toHaveAttribute("aria-selected", "true");
  }
};

export const EventIntake: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => diagnosticsWorkspace(), getEventBusActivity: async () => busActivity() }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: /Event intake/ }));
    await userEvent.click(canvas.getByRole("button", { name: "cheer" }));
    const detail = canvas.getByLabelText("Bus event detail");
    await expect(detail).toHaveTextContent("Screen Effects");
    await expect(detail).toHaveTextContent("ref-bus-effects");
  }
};

export const EventIntakeFromReference: Story = {
  args: { ...EventIntake.args, initialReferenceId: "ref-bus-effects" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Bus event detail")).toHaveTextContent("Failed");
    await expect(canvas.getByRole("tab", { name: /Event intake/ })).toHaveAttribute("aria-selected", "true");
  }
};

export const EventIntakeEmpty: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => diagnosticsWorkspace(), getEventBusActivity: async () => ({ events: [] }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: /Event intake/ }));
    await expect(canvas.getByText("No matching bus events")).toBeVisible();
  }
};

export const NoProblems: Story = {
  args: { managementApi: createStoryManagementApi({ getDiagnosticsWorkspace: async () => ({ ...diagnosticsWorkspace(), problems: [] }) }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No active problems")).toBeVisible();
  }
};

export const FiltersAndSelectedEvidenceSurviveRefresh: Story = {
  args: ActiveProblems.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Open problems" });
    await userEvent.click(canvas.getByRole("tab", { name: /Raw logs/ }));
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search" }), "ref-runtime-2");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Level" }), "ERROR");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Sort diagnostics" }), "oldest");
    await userEvent.click(canvas.getByRole("button", { name: /ref-runtime-2/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }));
    await expect(await canvas.findByLabelText("Raw log detail")).toHaveTextContent("ref-runtime-2");
    await expect(canvas.getByRole("tab", { name: /Raw logs/ })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("searchbox", { name: "Search" })).toHaveValue("ref-runtime-2");
    await expect(canvas.getByRole("combobox", { name: "Level" })).toHaveValue("ERROR");
    await expect(canvas.getByRole("combobox", { name: "Sort diagnostics" })).toHaveValue("oldest");
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

function busActivity(): EventBusActivityView {
  return {
    events: [
      { id: 4, receivedAt: "2026-10-08T12:00:04.000Z", sourceKind: "streamerbot", kind: null, eventType: null, outcome: "rejected", referenceId: "ref-bus-rejected", consumers: [] },
      { id: 3, receivedAt: "2026-10-08T12:00:03.000Z", sourceKind: "streamerbot", kind: "canonical", eventType: "follow", outcome: "merged", referenceId: null, consumers: [
        { consumerId: "alerts", outcome: "admitted", referenceId: null }
      ] },
      { id: 2, receivedAt: "2026-10-08T12:00:02.000Z", sourceKind: "twitch", kind: "canonical", eventType: "cheer", outcome: "accepted", referenceId: null, consumers: [
        { consumerId: "alerts", outcome: "expired", referenceId: null },
        { consumerId: "screen-effects", outcome: "failed", referenceId: "ref-bus-effects" }
      ] },
      { id: 1, receivedAt: "2026-10-08T12:00:01.000Z", sourceKind: "twitch", kind: "canonical", eventType: "follow", outcome: "accepted", referenceId: null, consumers: [
        { consumerId: "alerts", outcome: "admitted", referenceId: null },
        { consumerId: "screen-effects", outcome: "no-match", referenceId: null },
        { consumerId: "timers", outcome: "no-match", referenceId: null },
        { consumerId: "video-shoutout", outcome: "pending", referenceId: null }
      ] }
    ]
  };
}
