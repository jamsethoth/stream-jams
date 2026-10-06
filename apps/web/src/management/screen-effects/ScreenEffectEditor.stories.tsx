import { createStoryEffectSets } from "../../stories/screen-effect-set-fixtures.js";
import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type ScreenEffectDocument
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createStoryAudioApi } from "../../stories/audio-fixtures.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../navigation/dirty-navigation.js";
import { ManagementHttpError } from "../management-http-client.js";
import { ScreenEffectEditor, type ScreenEffectEditorProps } from "./ScreenEffectEditor.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

const neutral = effect();
const managementApi = createStoryManagementApi({
  getTwitchStatus: async () => ({
    connected: true,
    authorizationState: "ready",
    missingScopes: [],
    account: {
      accountId: "broadcaster-story",
      login: "story",
      displayName: "Story Broadcaster",
      scopes: ["channel:read:redemptions"],
      connectedAt: "2026-09-13T12:00:00.000Z",
      updatedAt: "2026-09-13T12:00:00.000Z"
    }
  }),
  getTwitchCustomRewards: async () => ({ rewards: [{
    id: "reward-story",
    title: "Neutral reward",
    prompt: "",
    cost: 100,
    backgroundColor: "#445566",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true
  }] })
});

const meta = { tags: ["stream-local-media", "mantine-feedback-tabs"],
  title: "Management/Screen Effects/Focused editor",
  component: ScreenEffectEditor,
  decorators: [(Story) => <DirtyNavigationProvider><div className="management-main management-main--focused"><Story /></div></DirtyNavigationProvider>],
  args: {
    api: createApi(neutral),
    assetApi: createStoryAssetApi(),
    audioApi: createStoryAudioApi(),
    create: false,
    effectId: neutral.id,
    generateId: (prefix: string) => `${prefix}-story-new`,
    managementApi,
    onBack: fn()
  },
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof ScreenEffectEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewDisabledDraft: Story = {
  args: { create: true, effectId: "effect-new-story" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Effect" }));
    await expect(await canvas.findByLabelText("Effect name")).toHaveValue("New Screen Effect");
    await expect(canvas.getByRole("checkbox", { name: /^Enabled$/u })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  }
};

export const KeyboardTabsRetainDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Effect" }));
    await userEvent.clear(canvas.getByLabelText("Effect name"));
    await userEvent.type(canvas.getByLabelText("Effect name"), "Retained keyboard draft");
    await userEvent.click(canvas.getByRole("tab", { name: "Effect" }));
    await userEvent.keyboard("{End}");
    const triggers = canvas.getByRole("tab", { name: "Triggers" });
    await expect(triggers).toHaveFocus();
    await expect(triggers).toHaveAttribute("aria-selected", "true");
    await expect(canvas.queryByLabelText("Effect name")).not.toBeInTheDocument();
    await userEvent.keyboard("{Home}{ArrowRight}");
    await expect(canvas.getByLabelText("Effect name")).toHaveValue("Retained keyboard draft");
  }
};

export const LocalDraftPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const preview = await canvas.findByRole("button", { name: /^Preview$/u });
    await expect(preview).toBeEnabled();
    await userEvent.click(preview);
    const dialog = within(canvas.getByRole("region", { name: "Effect canvas" }));
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).not.toBeInTheDocument();
    const playPreview = await dialog.findByRole("button", { name: "Play preview" });
    await waitFor(() => expect(playPreview).toBeEnabled());
    await userEvent.click(dialog.getByRole("checkbox", { name: "Mute preview" }));
    await userEvent.click(dialog.getByRole("button", { name: "Play preview" }));
    await expect(dialog.getByText(/Preview (playing|stopped)/)).toHaveTextContent("Preview playing");
    await userEvent.click(dialog.getByRole("button", { name: "Stop preview" }));
    await expect(dialog.getByText(/Preview (playing|stopped)/)).toHaveTextContent("Preview stopped");
  }
};

export const AudioOnly: Story = {
  tags: ["mantine-stage6c"],
  args: { api: createApi(effect({ audioOnly: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No visual selected.")).toBeVisible();
    await expect(canvas.getByText("Short chime")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Private headphones" })).toBeChecked();
  }
};

export const VideoWithSeparateSound: Story = {
  tags: ["mantine-stage6c", "mantine-stage6c-closure"],
  args: { api: createApi(effect({ video: true, separateSound: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const embeddedAudio = await canvas.findByRole("checkbox", { name: "Play embedded audio" });
    await expect(embeddedAudio).toBeChecked();
    await expect(canvasElement.querySelector(`label[for="${embeddedAudio.id}"]`)).toHaveClass("screen-effects-check");
    await expect(canvas.getByRole("checkbox", { name: /^OBS Browser Source$/u }).closest("label")).toHaveClass("screen-effects-check");
    await expect(canvas.getByText(/Both the video soundtrack and separate audio will play/u)).toBeVisible();
  }
};

export const VariantWeights: Story = {
  args: { api: createApi(effect({ multipleVariants: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: /^Alternate/u })).toBeVisible();
    await expect(canvas.getByText("Weight 1 · 25% expected · Enabled")).toBeVisible();
    await expect(canvas.getByText("Weight 3 · 75% expected · Enabled")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Simulate 1,000 selections" }));
    await expect(canvas.getByRole("table", { name: "Weight simulation" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /^Alternate/u }));
    await expect(canvas.getByLabelText("Variant weight")).toHaveValue(3);
    await userEvent.click(canvas.getByRole("button", { name: "Remove variant" }));
    const dialog = within(document.body).getByRole("dialog", { name: "Remove Alternate variant?" });
    await expect(dialog).toHaveTextContent("Save the Screen Effect to persist the change");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove variant" }));
    await expect(canvas.queryByRole("button", { name: /^Alternate/u })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await expect(canvas.getByRole("button", { name: /^Alternate/u })).toBeVisible();
  }
};

export const VariantCreationAndEffectDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "New variant" }));
    await expect(canvas.getByLabelText("Variant name")).toHaveValue("Variant 2");
    await expect(canvas.getByRole("checkbox", { name: "Variant enabled" })).not.toBeChecked();

    await userEvent.click(canvas.getByRole("tab", { name: "Effect" }));
    await expect(canvas.getByLabelText("Queue priority")).toBeVisible();
    await expect(canvas.getByText(/Higher numbers are queued first when one event matches multiple effects/)).toBeVisible();
    await expect(canvas.queryByLabelText("Effect cooldown")).not.toBeInTheDocument();
  }
};

export const MissingTrigger: Story = {
  args: { api: createApi(effect({ missingTrigger: true })) },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("tab", { name: "Triggers" }));
    await expect(await within(canvasElement).findByText(/Unavailable.*review event source setup/u)).toBeVisible();
  }
};

export const NoOutputs: Story = {
  args: { api: createApi(effect({ enabled: true, noOutputs: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const testSaved = await canvas.findByRole("button", { name: "Test saved…" });
    await expect(testSaved).toBeEnabled();
    await userEvent.click(testSaved);
    await expect(within(document.body).getByRole("alert")).toHaveTextContent("No destination is selected");
    await expect(within(document.body).getByRole("button", { name: "Confirm live test" })).toBeDisabled();
  }
};

export const FailedSaveRetainsDraft: Story = {
  beforeEach: () => {
    const report = console.error;
    console.error = (...args: unknown[]) => { if (!String(args[0]).includes("The Screen Effect was not saved. The draft is still here.")) report(...args); };
    return () => { console.error = report; };
  },
  args: {
    api: createApi(neutral, {
      update: async () => { throw new Error("Storage failed (ref-story-save)"); }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Effect" }));
    const name = await canvas.findByLabelText("Effect name");
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved neutral effect");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("ref-story-save");
    await expect(name).toHaveValue("Unsaved neutral effect");
  }
};

function NavigationEditor(args: ScreenEffectEditorProps) {
  const navigation = useManagementNavigation();
  return <>{navigation.guard}<main><ScreenEffectEditor {...args} onBack={() => navigation.requestNavigation({ id: "modules-screen-effects" })} /></main></>;
}

export const NavigationSaveFailure: Story = {
  tags: ["mantine-navigation-feedback"],
  render: (args) => <NavigationEditor {...args} />,
  beforeEach: () => {
    const report = console.error;
    console.error = (...args: unknown[]) => { if (!String(args[0]).startsWith("[story-navigation-ref] The Screen Effect was not saved.")) report(...args); };
    return () => { console.error = report; };
  },
  args: { api: createApi(neutral, { update: async () => { throw new ManagementHttpError("Local storage unavailable", "UNAVAILABLE", "story-navigation-ref", "Restart the local service, then try Save and leave again."); } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Effect" }));
    await userEvent.clear(canvas.getByLabelText("Effect name"));
    await userEvent.type(canvas.getByLabelText("Effect name"), "Retained navigation draft");
    await userEvent.click(canvas.getByRole("button", { name: "Back to Screen Effects" }));
    let dialog = within(await body.findByRole("dialog", { name: "Leave with unsaved changes?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save and leave" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("story-navigation-ref");
    await expect(body.getAllByRole("alert")).toHaveLength(1);
    await expect(dialog.getByRole("link", { name: "Open Diagnostics" })).toHaveAttribute("href", "/manage/diagnostics?reference=story-navigation-ref");
    await userEvent.click(dialog.getByRole("button", { name: "Dismiss error" }));
    await expect(body.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Save and leave" }));
    await dialog.findByRole("alert");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByLabelText("Effect name")).toHaveValue("Retained navigation draft");
    await expect(body.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Back to Screen Effects" }));
    dialog = within(await body.findByRole("dialog"));
    await expect(dialog.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Save and leave" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Restart the local service");
  }
};

export const PartialContextFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getTwitchStatus: async () => {
        throw new Error("Twitch connection status could not be loaded (ref-story-context).");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("Some editor context could not be loaded.");
    await expect(alert).toHaveTextContent("Twitch connection");
    await expect(canvas.getByRole("button", { name: "Retry editor context" })).toBeVisible();
    await userEvent.click(await canvas.findByRole("tab", { name: "Effect" }));
    await expect(canvas.getByLabelText("Effect name")).toHaveValue("Neutral effect");
  }
};

export const LiveTestConfirmation: Story = {
  args: { api: createApi(effect({ enabled: true, separateSound: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const testSaved = await canvas.findByRole("button", { name: "Test saved…" });
    await expect(testSaved).toBeEnabled();
    await userEvent.click(testSaved);
    const dialog = within(document.body).getByRole("dialog", { name: "Test saved Screen Effect?" });
    await expect(dialog).toHaveTextContent("Saved input");
    await expect(dialog).toHaveTextContent("OBS Browser Source visual");
    await expect(dialog).toHaveTextContent("OBS Browser Source audio");
    await expect(dialog).toHaveTextContent("Private headphones");
  }
};

function createApi(
  document: ScreenEffectDocument,
  overrides: Partial<ScreenEffectsApi> = {}
): ScreenEffectsApi {
  return {
    ...createStoryEffectSets([document.id]),
    list: async () => [document],
    listBrowserSources: async () => [],
    getModuleEnabled: async () => true,
    setModuleEnabled: async (enabled) => enabled,
    createBrowserSource: async (source) => source,
    regenerateBrowserSource: async (source) => source,
    get: async () => structuredClone(document),
    create: async (candidate) => candidate,
    update: async (_effectId, candidate) => candidate,
    remove: async () => undefined,
    test: async (effectId, variantId) => ({
      effectId,
      occurrenceId: `occurrence-${variantId}`,
      status: "queued"
    }),
    ...overrides
  };
}

function effect(options: {
  readonly audioOnly?: boolean;
  readonly enabled?: boolean;
  readonly missingTrigger?: boolean;
  readonly multipleVariants?: boolean;
  readonly noOutputs?: boolean;
  readonly separateSound?: boolean;
  readonly video?: boolean;
} = {}): ScreenEffectDocument {
  const draft = createScreenEffectDocument({
    id: "effect-neutral",
    name: "Neutral effect",
    defaultVariantId: "variant-default"
  });
  const visual = options.audioOnly
    ? null
    : options.video
      ? {
          mediaType: "video" as const,
          assetId: "asset-story-video",
          layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 },
          playEmbeddedAudio: true,
          audioVolume: 0.4
        }
      : {
          mediaType: "image" as const,
          assetId: "asset-alert-image",
          layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
        };
  const baseVariant = {
    ...draft.variants[0]!,
    visual,
    sound: options.audioOnly || options.separateSound
      ? { assetId: "asset-alert-sound", volume: 0.5 }
      : null,
    outputs: {
      browserSource: !options.noOutputs && (options.audioOnly || options.separateSound || options.video === true),
      deviceRouteIds: options.noOutputs ? [] : ["private"]
    },
    visualOutputs: {
      browserSource: !options.noOutputs && visual !== null,
      desktop: false
    }
  };
  return screenEffectDocumentSchema.parse({
    ...draft,
    enabled: options.enabled ?? false,
    bindings: options.missingTrigger ? [{
      id: "binding-missing",
      kind: "twitch-reward",
      broadcasterId: "broadcaster-story",
      rewardId: "reward-missing"
    }] : [],
    variants: [
      baseVariant,
      ...(options.multipleVariants ? [{
        ...baseVariant,
        id: "variant-alternate",
        name: "Alternate",
        weight: 3
      }] : [])
    ]
  });
}
