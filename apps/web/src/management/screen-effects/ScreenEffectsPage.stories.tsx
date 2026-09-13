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
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(args.onEdit).toHaveBeenCalledWith(savedEffect.id, false);
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
    list: async () => documents,
    listBrowserSources: async () => [{
      id: "effects-live",
      label: "Screen Effects live",
      purpose: "live",
      enabled: true,
      status: "available"
    }],
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
