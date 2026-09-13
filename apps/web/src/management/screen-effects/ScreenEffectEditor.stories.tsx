import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type ScreenEffectDocument
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { createStoryAudioApi } from "../../stories/audio-fixtures.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { ScreenEffectEditor } from "./ScreenEffectEditor.js";
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

const meta = {
  title: "Management/Screen Effects/Focused editor",
  component: ScreenEffectEditor,
  decorators: [(Story) => <DirtyNavigationProvider><Story /></DirtyNavigationProvider>],
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
    await expect(await canvas.findByLabelText("Effect name")).toHaveValue("New Screen Effect");
    await expect(canvas.getByRole("checkbox", { name: /^Enabled$/u })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  }
};

export const AudioOnly: Story = {
  args: { api: createApi(effect({ audioOnly: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No visual selected.")).toBeVisible();
    await expect(canvas.getByText("Short chime")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Private headphones" })).toBeChecked();
  }
};

export const VideoWithSeparateSound: Story = {
  args: { api: createApi(effect({ video: true, separateSound: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("checkbox", { name: "Play embedded audio" })).toBeChecked();
    await expect(canvas.getByText(/Both the video soundtrack and separate audio will play/u)).toBeVisible();
  }
};

export const WeightedVariants: Story = {
  args: { api: createApi(effect({ weighted: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("tab", { name: "Alternate" })).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Alternate" }));
    await expect(canvas.getByLabelText("Variant weight")).toHaveValue(3);
  }
};

export const MissingTrigger: Story = {
  args: { api: createApi(effect({ missingTrigger: true })) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Unavailable.*review event source setup/u)).toBeVisible();
  }
};

export const NoOutputs: Story = {
  args: { api: createApi(effect({ enabled: true, noOutputs: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Live Test…" }));
    await expect(within(document.body).getByRole("alert")).toHaveTextContent("No destination is selected");
    await expect(within(document.body).getByRole("button", { name: "Confirm live test" })).toBeDisabled();
  }
};

export const FailedSaveRetainsDraft: Story = {
  args: {
    api: createApi(neutral, {
      update: async () => { throw new Error("Storage failed (ref-story-save)"); }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByLabelText("Effect name");
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved neutral effect");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("ref-story-save");
    await expect(name).toHaveValue("Unsaved neutral effect");
  }
};

export const LiveTestConfirmation: Story = {
  args: { api: createApi(effect({ enabled: true, separateSound: true })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Live Test…" }));
    const dialog = within(document.body).getByRole("dialog", { name: "Send live Screen Effect test?" });
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
  readonly noOutputs?: boolean;
  readonly separateSound?: boolean;
  readonly video?: boolean;
  readonly weighted?: boolean;
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
      ...(options.weighted ? [{
        ...baseVariant,
        id: "variant-alternate",
        name: "Alternate",
        kind: "weighted" as const,
        weight: 3
      }] : [])
    ]
  });
}
