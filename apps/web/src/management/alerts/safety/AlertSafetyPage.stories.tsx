import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../../stories/mock-apis.js";
import { storyModerationExample } from "../../../stories/story-fixtures.js";
import { DirtyNavigationProvider } from "../../navigation/dirty-navigation.js";
import { AlertSafetyPage } from "./AlertSafetyPage.js";

const meta = {
  title: "Management/Alerts/AlertSafetyPage",
  component: AlertSafetyPage,
  decorators: [(Story) => <DirtyNavigationProvider><Story /></DirtyNavigationProvider>],
  parameters: {
    docs: {
      description: {
        component: "Shared alert text moderation with explicit save, candidate preview, and independent rendered/TTS policies."
      }
    }
  }
} satisfies Meta<typeof AlertSafetyPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CanonicalDefaults: Story = {
  args: { managementApi: createStoryManagementApi() }
};

export const EditedUnsavedPolicy: Story = {
  args: { managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const maximum = await canvas.findByLabelText("Rendered text maximum length");
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "320");
    await userEvent.click(canvas.getByLabelText("Rendered text strip web links"));
    await expect(canvas.getByRole("button", { name: "Save safety settings" })).toBeEnabled();
  }
};

export const NormalizedDuplicateTerms: Story = {
  args: {
    managementApi: createStoryManagementApi({
      async previewModeration(input) {
        return {
          target: input.target,
          settings: { ...input.settings!, blockedTerms: ["Spoiler", "loud noise"] },
          text: "A [blocked] remains safe.",
          actions: [{ type: "blocked-term-replaced", count: 1 }]
        };
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const terms = await canvas.findByLabelText("Rendered text blocked terms");
    await userEvent.clear(terms);
    await userEvent.type(terms, " Spoiler {enter}spoiler{enter}{enter}loud noise");
    await userEvent.click(canvas.getByRole("button", { name: "Preview example" }));
    const renderedPreview = await canvas.findByRole("region", { name: "Rendered text preview" });
    await expect(within(renderedPreview).findByText("Spoiler, loud noise")).resolves.toBeVisible();
  }
};

export const ModeratedExample: Story = {
  args: { managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sample = await canvas.findByLabelText("Moderation example");
    await userEvent.clear(sample);
    await userEvent.type(sample, storyModerationExample.sample);
    await userEvent.click(canvas.getByRole("button", { name: "Preview example" }));
    await expect(canvas.findAllByText("[blocked] details: [link removed]")).resolves.toHaveLength(2);
  }
};

export const InvalidBounds: Story = {
  args: { managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const maximum = await canvas.findByLabelText("Rendered text maximum length");
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "10001");
    await userEvent.click(canvas.getByRole("button", { name: "Preview example" }));
    await expect(canvas.findByText("Enter a whole number from 1 to 10000.")).resolves.toBeVisible();
  }
};

export const SaveFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      async updateModerationSettings() {
        throw new Error("Storage is unavailable (err_story_moderation)");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const maximum = await canvas.findByLabelText("Rendered text maximum length");
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "300");
    await userEvent.click(canvas.getByRole("button", { name: "Save safety settings" }));
    await expect(canvas.findByText("Safety settings were not saved")).resolves.toBeVisible();
  }
};

export const NarrowViewport: Story = {
  args: { managementApi: createStoryManagementApi() },
  parameters: {
    viewport: { defaultViewport: "mobile2" }
  }
};
