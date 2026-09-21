import { createStoryEffectSets } from "../../stories/screen-effect-set-fixtures.js";
import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type ScreenEffectDocument
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ScreenEffectsPage } from "./ScreenEffectsPage.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

const savedEffect = effect();

const meta = {
  title: "Management/Screen Effects/Inventory",
  component: ScreenEffectsPage,
  args: {
    api: createApi([savedEffect]),
    generateId: (prefix: string) => `${prefix}-story-new`,
    onEdit: fn()
  }
} satisfies Meta<typeof ScreenEffectsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inventory: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Neutral burst")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Browser sources" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(canvas.getByRole("button", { name: "Browser sources" }));
    const browserSources = canvas.getByRole("region", { name: "Browser sources" });
    const liveLabel = within(browserSources).getByText("Screen Effects Live");
    await expect(liveLabel).toBeVisible();
    await expect(getComputedStyle(liveLabel.parentElement!).display).toBe("grid");
    await expect(within(browserSources).getByText("URL available")).toBeVisible();
    await expect(within(browserSources).getByText("Screen Effects Test")).toBeVisible();
    await expect(within(browserSources).getByText("create required")).toBeVisible();
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search effects" }), "missing effect");
    await expect(canvas.getByRole("status")).toHaveTextContent("No effects match your search.");
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search effects" }));
    await userEvent.click(canvas.getByText("Neutral burst"));
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(args.onEdit).toHaveBeenCalledWith(savedEffect.id, false, "screen-effects-default");
  }
};

export const ActiveAndInactiveSets: Story = {
  args: { api: createApi([savedEffect], { listSets: async () => [
    { id: "live", name: "Live show", active: true, effectIds: [savedEffect.id] },
    { id: "gaming", name: "Gaming", active: false, effectIds: [] }
  ] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const live = await canvas.findByRole("region", { name: "Live show Screen Effect set" });
    await expect(within(live).getByRole("button", { name: "Delete set" })).toBeDisabled();
    await userEvent.click(within(live).getByText("Neutral burst"));
    await expect(within(live).getByRole("button", { name: "Default variant" })).toBeVisible();
    await expect(within(canvas.getByRole("region", { name: "Gaming Screen Effect set" })).getByRole("button", { name: "Activate set" })).toBeVisible();
  }
};

export const Empty: Story = {
  args: { api: createApi([]) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/No Screen Effects yet/u)).toBeVisible();
  }
};

export const Loading: Story = {
  args: { api: createApi([], { list: () => new Promise(() => undefined) }) }
};

export const LoadError: Story = {
  args: {
    api: createApi([], {
      list: async () => { throw new Error("Screen Effects service unavailable (ref-story-effects)"); }
    })
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("ref-story-effects");
  }
};

function createApi(
  documents: readonly ScreenEffectDocument[],
  overrides: Partial<ScreenEffectsApi> = {}
): ScreenEffectsApi {
  return {
    ...createStoryEffectSets(documents.map((document) => document.id)),
    list: async () => documents,
    listBrowserSources: async () => [
      {
        id: "effects-live",
        label: "Screen Effects Live",
        purpose: "live",
        overlayId: "default",
        scope: "module",
        moduleId: "screen-effects",
        targetProfileId: null,
        enabled: true,
        keyId: "effects-key",
        url: "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_story",
        status: "available"
      },
      {
        id: "effects-test",
        label: "Screen Effects Test",
        purpose: "test",
        overlayId: "default",
        scope: "module",
        moduleId: "screen-effects",
        targetProfileId: null,
        enabled: true,
        keyId: null,
        url: null,
        status: "create-required"
      }
    ],
    getModuleEnabled: async () => true,
    setModuleEnabled: async (enabled) => enabled,
    createBrowserSource: async (source) => source,
    regenerateBrowserSource: async (source) => source,
    get: async (effectId) => documents.find((document) => document.id === effectId) ?? savedEffect,
    create: async (document) => document,
    update: async (_effectId, document) => document,
    remove: async () => undefined,
    test: async (effectId, variantId) => ({
      effectId,
      occurrenceId: `occurrence-${variantId}`,
      status: "queued"
    }),
    ...overrides
  };
}

function effect(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({
    id: "effect-neutral-burst",
    name: "Neutral burst",
    defaultVariantId: "variant-default"
  });
  return screenEffectDocumentSchema.parse({
    ...draft,
    category: "Utility",
    variants: [{
      ...draft.variants[0],
      visual: {
        mediaType: "image",
        assetId: "asset-alert-image",
        layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
      },
      visualOutputs: { browserSource: true, desktop: false }
    }]
  });
}
