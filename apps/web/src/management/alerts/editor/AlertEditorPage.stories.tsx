import type { AlertEditorDocument, AlertSetDetail } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../../stories/mock-apis.js";
import { DirtyNavigationProvider } from "../../navigation/dirty-navigation.js";
import { AlertEditorPage } from "./AlertEditorPage.js";

const document = editorDocument();
const managementApi = createStoryManagementApi({
  getAlertEditorDocument: async () => document,
  getAlertSet: async () => alertSetDetail()
});

const meta = {
  title: "Management/Alerts/Focused editor",
  component: AlertEditorPage,
  decorators: [(Story) => <DirtyNavigationProvider><Story /></DirtyNavigationProvider>],
  args: {
    alertId: document.id,
    assetApi: createStoryAssetApi(),
    managementApi,
    onBack: fn(),
    onOpenAlert: fn(),
    targetProfileId: "landscape"
  },
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof AlertEditorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyLandscape: Story = {};

export const VerticalNeedsReview: Story = {
  args: { targetProfileId: "vertical" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Vertical alert canvas" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Send test" })).toBeDisabled();
  }
};

export const UnsavedEdit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = await canvas.findByRole("textbox", { name: "Message template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Welcome to the stream!");
    await expect(canvas.getByText("Unsaved")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Revert" })).toBeEnabled();
  }
};

export const ActiveSetSaveWarning: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = await canvas.findByRole("textbox", { name: "Message template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Live output update");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const dialog = within(
      await within(globalThis.document.body).findByRole("dialog", { name: "Save changes to active alert?" })
    );
    await expect(dialog.getByText("Follow events")).toBeVisible();
    await expect(dialog.getByText("Landscape")).toBeVisible();
  }
};

export const NoLayerSelection: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ({
        ...document,
        layers: [],
        targetProfiles: document.targetProfiles.map((profile) => ({ ...profile, layerLayouts: [] }))
      }),
      getAlertSet: async () => alertSetDetail()
    })
  }
};

export const EventSamples: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await expect(canvas.getByRole("combobox", { name: "Sample payload" })).toHaveValue("normal");
    const payload = canvas.getByRole("textbox", { name: "Session payload (JSON)" });
    await expect(payload).toHaveValue('{\n  "userName": "James"\n}');
  }
};

export const DeliveryFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertSet: async () => alertSetDetail(),
      sendAlertEditorTest: async () => {
        throw new Error("No connected landscape browser source. Reference ref-story-output.");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Send test" }));
    await expect(await canvas.findByText("The alert test was not sent")).toBeVisible();
    await expect(canvas.getAllByText(/ref-story-output/)).toHaveLength(2);
  }
};

function editorDocument(): AlertEditorDocument {
  const preset = (entrance: "fade" | "scale") => ({
    mode: "preset" as const,
    entrance,
    exit: "fade" as const,
    durationMs: 300,
    delayMs: 0,
    easing: "ease-out"
  });
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    durationMs: 5_000,
    layers: [
      { id: "layer-text", name: "Message", type: "text", visible: true, order: 0, template: "Thanks, {userName}!", animation: preset("fade") },
      { id: "layer-image", name: "Celebration", type: "image", visible: true, order: 1, assetId: "asset-alert-image", animation: preset("scale") }
    ],
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        layerLayouts: [
          { layerId: "layer-text", x: 610, y: 720, width: 700, height: 160, zIndex: 0 },
          { layerId: "layer-image", x: 710, y: 220, width: 500, height: 420, zIndex: 1 }
        ]
      },
      {
        id: "vertical",
        enabled: false,
        reviewState: "needs-review",
        layerLayouts: [
          { layerId: "layer-text", x: 190, y: 1180, width: 700, height: 160, zIndex: 0 },
          { layerId: "layer-image", x: 290, y: 520, width: 500, height: 420, zIndex: 1 }
        ]
      }
    ],
    samplePayloads: [
      { id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "James" } },
      { id: "edge", label: "Long-content example", kind: "built-in", payload: { userName: "A-Very-Long-Display-Name" } }
    ]
  };
}

function alertSetDetail(): AlertSetDetail {
  return {
    overview: {
      id: "set-default",
      name: "Everyday alerts",
      active: true,
      starter: false,
      starterReviewState: "complete",
      enabledAlertCount: 2,
      targetProfiles: [
        { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
        { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 1 }
      ],
      validationIssues: [],
      outputs: []
    },
    inventory: [
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", name: "New follower", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", name: "New raid", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}
