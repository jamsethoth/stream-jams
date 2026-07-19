import type { AlertEditorDocument, AlertSetDetail, RegisteredProviderView } from "@stream-jams/core";
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

export const CopiedVerticalLayout: Story = {
  args: { targetProfileId: "vertical" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Alert" }));
    await userEvent.click(canvas.getByRole("button", { name: "Copy layout from Landscape" }));
    await expect(canvas.getByText("Landscape layout copied to Vertical. Review the generated layout before enabling it.")).toBeVisible();
    await expect(canvas.getAllByText("Needs review")).not.toHaveLength(0);
  }
};

export const HiddenGuidesWithTestBackground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Landscape alert canvas" });
    await userEvent.click(canvas.getByRole("button", { name: "Toggle safe area and center guides" }));
    await userEvent.click(canvas.getByRole("button", { name: "Toggle canvas grid" }));
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Canvas background" }), "test");
    await expect(canvas.getByLabelText("Test background color")).toBeVisible();
    await expect(canvas.getByText("Guides hidden")).toBeVisible();
  }
};

export const DirtyProfileSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = await canvas.findByRole("textbox", { name: "Message template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Unsaved profile edit");
    await userEvent.click(canvas.getByRole("button", { name: /Vertical/ }));
    const dialog = within(await within(globalThis.document.body).findByRole("dialog", { name: "Switch profiles with unsaved changes?" }));
    await expect(dialog.getByRole("button", { name: "Save and switch" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Discard and switch" })).toBeVisible();
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

export const EdgeCaseSample: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Sample payload" }), "edge");
    await expect((canvas.getByRole("textbox", { name: "Session payload (JSON)" }) as HTMLTextAreaElement).value).toContain(
      "A-Very-Long-Display-Name"
    );
  }
};

export const CommunityGiftSamplesAndConditions: Story = {
  tags: ["task-5-expanded-event"],
  args: {
    alertId: "alert-community-gift",
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => communityGiftDocument(),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const sample = canvas.getByRole("combobox", { name: "Sample payload" });
    await expect(sample).toHaveValue("normal");
    await expect((canvas.getByRole("textbox", { name: "Session payload (JSON)" }) as HTMLTextAreaElement).value).toContain("Community gift");
    await userEvent.selectOptions(sample, "edge");
    await expect((canvas.getByRole("textbox", { name: "Session payload (JSON)" }) as HTMLTextAreaElement).value).toContain("25");

    const conditions = within(canvas.getByRole("group", { name: "Rule conditions" }));
    await userEvent.click(conditions.getByRole("button", { name: "Add gift tier" }));
    await expect(conditions.getByRole("combobox", { name: "Rule conditions Gift tier" })).toHaveValue("1000");
    await userEvent.click(conditions.getByRole("button", { name: "Add gift count minimum" }));
    await expect(conditions.getByRole("spinbutton", { name: "Rule conditions Gift count minimum" })).toHaveValue(5);
  }
};

export const PausedPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Preview" }));
    await userEvent.click(canvas.getByRole("button", { name: "Pause preview" }));
    await expect(canvas.getByText("Preview paused")).toBeVisible();
    await expect(canvas.getByRole("slider", { name: "Preview position" })).toBeVisible();
  }
};

export const InvalidSample: Story = {
  args: {
    alertId: "alert-raid",
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ({
        ...variationDocument(),
        id: "alert-raid",
        kind: "default",
        parentAlertId: null,
        samplePayloads: [{ id: "normal", label: "Invalid raid", kind: "built-in", payload: { userName: "Raider", raidViewers: 0, amount: 0 } }]
      }),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Raid viewer count must be a positive number.");
    await expect(canvas.getAllByRole("button", { name: "Preview" })[0]).toBeDisabled();
  }
};

export const OptionalPreviewMedia: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ({
        ...document,
        layers: [
          ...document.layers,
          { id: "layer-audio", name: "Sound", type: "audio", visible: true, order: 2, assetId: "asset-alert-audio", volume: 0.7, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } },
          { id: "layer-tts", name: "Speech", type: "tts", visible: true, order: 3, enabled: true, providerId: "speakerbot", template: "Welcome {userName}", animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }
        ]
      }),
      getAlertSet: async () => alertSetDetail(),
      listRegisteredProviders: async (capability) => capability === "tts" ? [activeSpeakerBot] : []
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Preview audio" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Preview TTS" }));
    await expect(canvas.getByRole("checkbox", { name: "Preview audio" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Preview TTS" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Send audio" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Send TTS" })).toBeChecked();
  }
};

export const ActiveSpeakerBotTts: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ttsEditorDocument(true),
      getAlertSet: async () => alertSetDetail(),
      listRegisteredProviders: async (capability) => capability === "tts" ? [activeSpeakerBot] : []
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Studio Speaker.bot")).toBeVisible();
    await expect(canvas.getByText("Speaker.bot is used for live TTS.")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Enable TTS for this alert" })).toBeChecked();
  }
};

export const NoActiveTtsProvider: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ttsEditorDocument(false),
      getAlertSet: async () => alertSetDetail(),
      listRegisteredProviders: async () => []
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("An active TTS provider is required before this layer can be used live.")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Enable TTS for this alert" })).toBeDisabled();
    await expect(canvas.getByRole("link", { name: "Set up a TTS provider" })).toHaveAttribute("href", "/manage/tts-providers");
  }
};

export const VariationAuthoring: Story = {
  args: {
    alertId: "variant-large-raid",
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => variationDocument(),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await expect(canvas.getByRole("group", { name: "Variation conditions" })).toBeVisible();
    await expect(canvas.getByRole("spinbutton", { name: "Variation weight" })).toHaveValue(2);
    await expect(canvas.getByText("Rule controls are shared by the default and every variation for this event.")).toBeVisible();
  }
};

export const InvalidConditionInput: Story = {
  args: {
    alertId: "variant-large-raid",
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ({
        ...variationDocument(),
        variantConditions: [{ field: "raidViewers", operator: "min", value: 0 }]
      }),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const conditions = within(canvas.getByRole("group", { name: "Variation conditions" }));
    await expect(conditions.getByRole("alert")).toHaveTextContent("Raid viewer minimum must be 1 or greater.");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
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
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    templateVariables: [
      { key: "userName", label: "User name", description: "Display name for the event actor." },
      { key: "actor.displayName", label: "Actor display name", description: "Normalized display name for the event actor." }
    ],
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

function variationDocument(): AlertEditorDocument {
  return {
    ...editorDocument(),
    id: "variant-large-raid",
    eventType: "raid",
    kind: "variation",
    parentAlertId: "alert-raid",
    name: "Large raid",
    enabled: false,
    weight: 2,
    priority: 5,
    templateVariables: [
      ...(editorDocument().templateVariables ?? []),
      { key: "raidViewers", label: "Raid viewers", description: "Number of viewers in the raid." }
    ],
    samplePayloads: [
      { id: "normal", label: "Normal raid", kind: "built-in", payload: { userName: "Raider", raidViewers: 25, amount: 25 } },
      { id: "edge", label: "Large raid", kind: "built-in", payload: { userName: "A-Very-Long-Raider-Name", raidViewers: 5_000, amount: 5_000 } }
    ]
  };
}

function communityGiftDocument(): AlertEditorDocument {
  return {
    ...editorDocument(),
    id: "alert-community-gift",
    eventType: "community_gift",
    name: "Community gift received",
    templateVariables: [
      ...(editorDocument().templateVariables ?? []),
      { key: "tier", label: "Gift tier", description: "Subscription tier for the community gift." },
      { key: "amount", label: "Gift count", description: "Number of subscriptions in the community gift." },
      { key: "cumulativeTotal", label: "Cumulative total", description: "Gift subscriptions from the gifter during the stream." }
    ],
    layers: editorDocument().layers.map((layer) => layer.type === "text"
      ? { ...layer, template: "{userName} gifted {amount} subscriptions!" }
      : layer),
    samplePayloads: [
      {
        id: "normal",
        label: "Normal aggregate community gift",
        kind: "built-in",
        payload: { actor: { id: "gifter-normal", displayName: "Community gift" }, userName: "Community gift", tier: "1000", amount: 5, cumulativeTotal: 42, frequency: "Aggregate community gift" }
      },
      {
        id: "edge",
        label: "Edge aggregate community gift",
        kind: "built-in",
        payload: { actor: { id: "gifter-edge", displayName: "A-Very-Long-Community-Gifter-Name" }, userName: "A-Very-Long-Community-Gifter-Name", tier: "3000", amount: 25, cumulativeTotal: 250, frequency: "Aggregate community gift" }
      }
    ]
  };
}

function ttsEditorDocument(enabled: boolean): AlertEditorDocument {
  return {
    ...editorDocument(),
    layers: [{
      id: "layer-tts",
      name: "Speech",
      type: "tts",
      visible: true,
      order: 0,
      enabled,
      providerId: "browser-speech",
      template: "Welcome {userName}",
      animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }
    }],
    targetProfiles: editorDocument().targetProfiles.map((profile) => ({ ...profile, layerLayouts: [] }))
  };
}

const activeSpeakerBot: RegisteredProviderView = {
  id: "provider-speakerbot",
  name: "Studio Speaker.bot",
  kind: "speakerbot",
  capability: "tts",
  active: true,
  connectionState: "connected",
  intakeState: null,
  validatedAt: "2026-07-18T04:00:00.000Z",
  error: null,
  usedByAlertCount: 1
};

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
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", parentAlertId: null, name: "New follower", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: null, name: "New raid", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}
