import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument,
  type AlertSetDetail,
  type AlertVariationAuthoringContext,
  type RegisteredProviderView
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../../stories/mock-apis.js";
import { DirtyNavigationProvider } from "../../navigation/dirty-navigation.js";
import { AlertEditorPage } from "./AlertEditorPage.js";

const document = editorDocument();
const managementApi = createStoryManagementApi({
  getAlertEditorDocument: async () => document,
  getAlertVariationAuthoringContext: async () => variationContext(document),
  getAlertSet: async () => alertSetDetail()
});

const meta = {
  title: "Management/Alerts/Focused editor",
  component: AlertEditorPage,
  decorators: [(Story, context) => {
    const storyApi = context.args.managementApi;
    const apiWithContext = {
      ...storyApi,
      async getAlertVariationAuthoringContext(alertId: string) {
        try {
          return await storyApi.getAlertVariationAuthoringContext(alertId);
        } catch {
          return variationContext(await storyApi.getAlertEditorDocument(alertId));
        }
      }
    };
    return <DirtyNavigationProvider><Story args={{ ...context.args, managementApi: apiWithContext }} /></DirtyNavigationProvider>;
  }],
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

export const CompatibilityTextStyle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Typography", { selector: "summary" }));
    const typography = within(await canvas.findByRole("group", { name: "Typography" }));
    await expect(typography.getByLabelText("Font preset")).toHaveValue("system-sans");
    await expect(typography.getByLabelText("Font size")).toHaveValue(32);
    await expect(typography.getByLabelText("Font weight")).toHaveValue("800");
    await userEvent.click(canvas.getByText("Text box", { selector: "summary" }));
    await expect(canvas.getByRole("group", { name: "Text box" })).toBeVisible();
  }
};

export const CollapsibleLayerSections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Typography", { selector: "summary" });
    const disclosures = [
      ["Typography", "Font size"],
      ["Text box", "Padding"],
      ["Position and size", "X"],
      ["Animation preset", "Animation duration (milliseconds)"]
    ] as const;
    for (const [label, controlLabel] of disclosures) {
      const summary = canvas.getByText(label, { selector: "summary" });
      await expect(summary.closest("details")).not.toHaveAttribute("open");
      const control = canvas.getByLabelText(controlLabel);
      await expect(control).not.toBeVisible();
      await userEvent.click(summary);
      await expect(summary.closest("details")).toHaveAttribute("open");
      await expect(control).toBeVisible();
      await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    }
    await expect(canvas.getByLabelText("Font size")).toHaveValue(32);
  }
};

export const ContrastingCustomTextStyle: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => styledEditorDocument(),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Typography", { selector: "summary" }));
    await expect(await canvas.findByLabelText("Font preset")).toHaveValue("serif");
    await expect(canvas.getByLabelText("Font size")).toHaveValue(64);
    await userEvent.click(canvas.getByText("Text box", { selector: "summary" }));
    await expect(canvas.getByLabelText("Background color opacity")).toHaveValue("75");
  }
};

export const VerticalCustomTextStyle: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => styledEditorDocument(),
      getAlertSet: async () => alertSetDetail()
    }),
    targetProfileId: "vertical"
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Vertical alert canvas" })).toBeVisible();
    await userEvent.click(canvas.getByText("Typography", { selector: "summary" }));
    await expect(canvas.getByLabelText("Font preset")).toHaveValue("serif");
  }
};

export const InvalidTextStyle: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => ({
        ...styledEditorDocument(),
        layers: styledEditorDocument().layers.map((layer) => layer.type === "text"
          ? { ...layer, textStyle: { ...layer.textStyle, fontSizePx: 513 } }
          : layer)
      }),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Typography", { selector: "summary" }));
    await expect(await canvas.findByText("Font size must be between 8 and 512.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Preview" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  }
};

export const ShapeBackground: Story = {
  args: {
    managementApi: shapeStoryApi(shapeEditorDocument("background"))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Background layer" })).toBeVisible();
    await expect(canvas.getByLabelText("Fill color")).toHaveValue("#102030");
    await expect(canvas.getByLabelText("Fill opacity")).toHaveValue("75");
  }
};

export const ShapeBadge: Story = {
  args: {
    managementApi: shapeStoryApi(shapeEditorDocument("badge"))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findByText("Badge")).closest("button")!);
    await expect(canvas.getByRole("button", { name: "Badge layer" })).toBeVisible();
    await expect(canvas.getByLabelText("Fill color")).toHaveValue("#45c4ae");
  }
};

export const HiddenShape: Story = {
  args: {
    managementApi: shapeStoryApi(shapeEditorDocument("hidden"))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Show Hidden background" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Hidden background layer" })).not.toBeInTheDocument();
  }
};

export const VerticalShape: Story = {
  args: {
    managementApi: shapeStoryApi(shapeEditorDocument("badge")),
    targetProfileId: "vertical"
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Vertical alert canvas" })).toBeVisible();
    await userEvent.click((await canvas.findByText("Badge")).closest("button")!);
    await userEvent.click(canvas.getByText("Position and size", { selector: "summary" }));
    await expect(within(canvas.getByRole("group", { name: "Position and size" })).getByLabelText("X")).toHaveValue(190);
  }
};

export const InvalidShapeFill: Story = {
  args: {
    managementApi: shapeStoryApi({
      ...shapeEditorDocument("badge"),
      layers: shapeEditorDocument("badge").layers.map((layer) => layer.type === "shape"
        ? { ...layer, fill: "linear-gradient(red, blue)" }
        : layer)
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Badge has an invalid solid fill.");
    await expect(canvas.getByRole("button", { name: "Preview" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Send test" })).toBeDisabled();
  }
};

export const ShapeCopyReviewState: Story = {
  args: {
    managementApi: shapeStoryApi(shapeEditorDocument("background")),
    targetProfileId: "vertical"
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Alert" }));
    await userEvent.click(canvas.getByRole("button", { name: "Copy layout from Landscape" }));
    await expect(canvas.getByText("Landscape layout copied to Vertical.")).toBeVisible();
    await expect(canvas.getAllByText("Needs review")).not.toHaveLength(0);
  }
};

export const NarrowScreenStyleGuard: Story = {
  parameters: {
    viewport: {
      defaultViewport: "styleNarrow",
      options: {
        styleNarrow: { name: "Style guard 640 x 900", styles: { width: "640px", height: "900px" } }
      }
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", {
      name: "Alert editor requires a larger screen",
      hidden: true
    })).toBeInTheDocument();
  }
};

export const ReducedMotionStyleAuthoring: Story = {
  parameters: { reducedMotion: "reduce" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Typography", { selector: "summary" }));
    await expect(await canvas.findByRole("group", { name: "Typography" })).toBeVisible();
    await expect(canvas.queryByText("Preview playing")).not.toBeInTheDocument();
  }
};

export const ReadyLandscape: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "AlertsEveryday alertsNew follower"
    );
    await waitFor(() => expect(canvas.getByRole("status", { name: "Canvas zoom" })).not.toHaveTextContent("100%"));
  }
};

export const StarterThemeConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Alert" }));
    await userEvent.click(canvas.getByRole("button", { name: "Apply starter theme" }));
    const dialog = within(await within(globalThis.document.body).findByRole("dialog", { name: "Apply starter theme?" }));
    await userEvent.click(dialog.getByRole("radio", { name: "Neon Terminal" }));
    await expect(dialog.getByRole("radio", { name: "Neon Terminal" })).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Apply theme" })).toBeVisible();
  }
};

export const StarterThemeAppliedWarning: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Alert" }));
    await userEvent.click(canvas.getByRole("button", { name: "Apply starter theme" }));
    const dialog = within(await within(globalThis.document.body).findByRole("dialog", { name: "Apply starter theme?" }));
    await userEvent.click(dialog.getByRole("radio", { name: "Neon Terminal" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply theme" }));
    await expect(canvas.getByText("Starter theme applied.")).toBeVisible();
    await expect(canvas.getByText("Alert disabled")).toBeVisible();
    await expect(canvas.getAllByText("Needs review").length).toBeGreaterThanOrEqual(2);
  }
};

export const GroupedEventNavigation: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertVariationAuthoringContext: async () => variationContext(document),
      getAlertSet: async () => groupedAlertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Follow alerts, selected event" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(canvas.getByRole("button", { name: /Collapse Raid/u })).toHaveAttribute("aria-expanded", "true"));
    await expect(canvas.getByText("Variation of New raid")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Orphan variations" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /Collapse Raid/u }));
    await userEvent.type(canvas.getByLabelText("Search alerts"), "large raid");
    await expect(canvas.getByRole("button", { name: /Collapse Raid/u })).toHaveAttribute("aria-expanded", "true");
  }
};

export const NoMatchingEventNavigation: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertVariationAuthoringContext: async () => variationContext(document),
      getAlertSet: async () => groupedAlertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByLabelText("Search alerts");
    await userEvent.type(search, "not-an-alert");
    await expect(canvas.getByText("No matching alerts.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));
    await expect(search).toHaveValue("");
    await expect(canvas.getByRole("button", { name: "Follow alerts, selected event" })).toBeVisible();
  }
};

export const ModeratedLocalPreview: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertVariationAuthoringContext: async () => variationContext(document),
      getAlertSet: async () => alertSetDetail(),
      previewModeration: async (input) => ({
        target: input.target,
        settings: { maxLength: 240, blockedTerms: ["James"], stripUrls: true },
        text: input.target === "rendered" ? "Thanks, [blocked]!" : "[blocked]",
        actions: [{ type: "blocked-term-replaced", count: 1 }]
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Preview" }));
    await expect(await canvas.findByText("Thanks, [blocked]!")).toBeInTheDocument();
    await expect(canvas.queryByText("Thanks, James!")).not.toBeInTheDocument();
    await expect(canvas.getByText("Local preview is running.")).toBeVisible();
  }
};

export const SafeLocalPreviewFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertVariationAuthoringContext: async () => variationContext(document),
      getAlertSet: async () => alertSetDetail(),
      previewModeration: async () => {
        throw new Error("Moderation preview unavailable. ref_story_moderation");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Preview" }));
    await expect(await canvas.findByText("Local preview could not be prepared")).toBeVisible();
    await expect(canvas.getAllByText(/ref_story_moderation/u).length).toBeGreaterThan(0);
    await expect(canvas.queryByRole("button", { name: "Pause preview" })).not.toBeInTheDocument();
  }
};

export const TabletWorkspace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Landscape alert canvas" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Fit" })).toBeVisible();
  },
  parameters: {
    viewport: {
      defaultViewport: "editorTablet",
      options: {
        editorTablet: { name: "Editor tablet 820 x 768", styles: { width: "820px", height: "768px" } }
      }
    }
  }
};

export const VerticalNeedsReview: Story = {
  args: { targetProfileId: "vertical" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Vertical alert canvas" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Send test" })).toBeDisabled();
    const warning = (await canvas.findByText(/This generated layout is editable/u)).closest(".alert-editor-page__profile-warning");
    await expect(warning).not.toBeNull();
    const warningCanvas = within(warning as HTMLElement);
    await userEvent.click(warningCanvas.getByRole("button", { name: "Mark reviewed" }));
    await expect(canvas.getByText("Unsaved")).toBeVisible();
    await expect(canvas.queryByText(/This generated layout is editable/u)).not.toBeInTheDocument();
  }
};

export const CopiedVerticalLayout: Story = {
  args: { targetProfileId: "vertical" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Alert" }));
    await userEvent.click(canvas.getByRole("button", { name: "Copy layout from Landscape" }));
    const warning = canvas.getByText("Landscape layout copied to Vertical.").closest(".management-toast");
    await expect(warning).not.toBeNull();
    await expect(warning).toHaveClass("management-toast--warning");
    await expect(warning).toHaveTextContent("Landscape layout copied to Vertical.");
    await expect(warning).toHaveTextContent("Review the generated layout before enabling it.");
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

export const UnsavedProfileInspection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = await canvas.findByRole("textbox", { name: "Message template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Unsaved profile edit");
    await userEvent.click(canvas.getByRole("button", { name: /Vertical/ }));
    await expect(canvas.getByRole("region", { name: "Vertical alert canvas" })).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Message template" })).toHaveValue("Unsaved profile edit");
    await expect(within(globalThis.document.body).queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();
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

export const ActionFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => document,
      getAlertSet: async () => ({
        ...alertSetDetail(),
        overview: { ...alertSetDetail().overview, active: false }
      }),
      saveAlertEditorDocument: fn(async () => {
        throw new Error("Database write failed. (INTERNAL_SERVER_ERROR, err_story_editor_save)");
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const template = await canvas.findByRole("textbox", { name: "Message template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Unsaved message");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("The alert was not saved")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Dismiss error" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute(
      "href",
      "/manage/diagnostics?reference=err_story_editor_save"
    );
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
  tags: ["task-5-expanded-event", "task-9-template-catalog"],
  args: {
    alertId: "alert-community-gift",
    managementApi: createStoryManagementApi({
      getAlertEditorDocument: async () => communityGiftDocument(),
      getAlertSet: async () => alertSetDetail()
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Insert {gifterName}" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Insert {giftCount}" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Insert {tier}" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Insert {cumulativeGifts}" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Insert {userName}" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Insert {amount}" })).not.toBeInTheDocument();
    await expect(await canvas.findByText("Community gift gifted 5 subscriptions (42 total)!")).toBeVisible();
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const sample = canvas.getByRole("combobox", { name: "Sample payload" });
    await expect(sample).toHaveValue("normal");
    await expect((canvas.getByRole("textbox", { name: "Session payload (JSON)" }) as HTMLTextAreaElement).value).toContain("Community gift");
    await userEvent.selectOptions(sample, "edge");
    await expect((canvas.getByRole("textbox", { name: "Session payload (JSON)" }) as HTMLTextAreaElement).value).toContain("25");

    const conditions = within(canvas.getByRole("group", { name: "Rule conditions" }));
    await userEvent.click(conditions.getByRole("button", { name: "Add condition" }));
    await expect(conditions.getByRole("combobox", { name: "Rule conditions Subscription tier value" })).toHaveValue("prime");
    await userEvent.click(conditions.getByRole("button", { name: "Add condition" }));
    await userEvent.selectOptions(conditions.getByRole("combobox", { name: "Rule conditions condition 2 field" }), "giftCount");
    await userEvent.selectOptions(conditions.getByRole("combobox", { name: "Rule conditions Gift count operator" }), "min");
    await expect(conditions.getByRole("spinbutton", { name: "Rule conditions Gift count value" })).toHaveValue(1);
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
    const cooldown = canvas.getByRole("spinbutton", { name: "Cooldown (seconds)" });
    await userEvent.clear(cooldown);
    await userEvent.type(cooldown, "15");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
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
    const liveTtsSummary = await canvas.findByText("Live TTS", { selector: "summary" });
    await expect(liveTtsSummary.closest("details")).not.toHaveAttribute("open");
    const enabled = canvas.getByRole("checkbox", { name: "Enable TTS for this alert" });
    await expect(enabled).not.toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(liveTtsSummary);
    await expect(liveTtsSummary.closest("details")).toHaveAttribute("open");
    await expect(enabled).toBeVisible();
    await expect(enabled).toBeChecked();
    await expect(canvas.getByText("Studio Speaker.bot")).toBeVisible();
    await expect(canvas.getByText("Speaker.bot is used for live TTS.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    const template = canvas.getByRole("textbox", { name: "TTS template" });
    await userEvent.clear(template);
    await userEvent.type(template, "Storybook TTS save");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const dialog = within(
      await within(globalThis.document.body).findByRole("dialog", { name: "Save changes to active alert?" })
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Saved")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
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
    const liveTtsSummary = await canvas.findByText("Live TTS", { selector: "summary" });
    await expect(liveTtsSummary.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(liveTtsSummary);
    await expect(await canvas.findByText("An active TTS provider is required before this layer can be used live.")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Enable TTS for this alert" })).toBeDisabled();
    await expect(canvas.getByRole("link", { name: "Set up a TTS provider" })).toHaveAttribute("href", "/manage/tts-providers");
  }
};

export const VariationAuthoring: Story = {
  args: {
    alertId: "variant-large-raid",
    managementApi: variationStoryApi(variationDocument(), [
      variationCandidate("variant-medium-raid", "Medium raid", { priority: 3 }),
      variationCandidate("variant-disabled-raid", "Disabled raid", { enabled: false, priority: 3 })
    ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    await expect(canvas.getByRole("group", { name: "Variation conditions" })).toBeVisible();
    await expect(canvas.getByRole("spinbutton", { name: "Relative chance" })).toHaveValue(2);
    await expect(canvas.getByRole("region", { name: "Priority groups" })).toBeVisible();
    await expect(canvas.getByText("These rule controls are shared by the default and every variation for this event.")).toBeVisible();
  }
};

export const InvalidConditionInput: Story = {
  args: {
    alertId: "variant-large-raid",
    managementApi: variationStoryApi({
      ...variationDocument(),
      variantConditions: [{ field: "raidViewers", operator: "min", value: 0 }]
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const conditions = within(canvas.getByRole("group", { name: "Variation conditions" }));
    await expect(conditions.getByRole("alert")).toHaveTextContent("Raid viewers must be at least 1.");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(canvas.getByRole("region", { name: "Sample selection explanation" })).toHaveTextContent("Correct the event settings to explain selection.");
  }
};

export const SingleEligibleVariation: Story = {
  args: {
    alertId: "variant-single-raid",
    managementApi: variationStoryApi(selectionVariation({ id: "variant-single-raid", name: "Single eligible raid", priority: 5 }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const explanation = canvas.getByRole("region", { name: "Sample selection explanation" });
    await expect(explanation).toHaveTextContent("Single eligible raid");
    await expect(explanation).toHaveTextContent("1/1 weight · 100% relative chance");
  }
};

export const WeightedTopGroup: Story = {
  args: {
    alertId: "variant-quarter-raid",
    managementApi: variationStoryApi(
      selectionVariation({ id: "variant-quarter-raid", name: "Quarter chance raid", priority: 8, weight: 1 }),
      [variationCandidate("variant-three-quarter-raid", "Three-quarter chance raid", { priority: 8, weight: 3 })]
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const explanation = canvas.getByRole("region", { name: "Sample selection explanation" });
    await expect(explanation).toHaveTextContent("1/4 weight · 25% relative chance");
    await expect(explanation).toHaveTextContent("3/4 weight · 75% relative chance");
    await expect(explanation).toHaveTextContent("Live selection remains random.");
  }
};

export const DefaultFallback: Story = {
  args: {
    alertId: "variant-no-match-raid",
    managementApi: variationStoryApi(selectionVariation({
      id: "variant-no-match-raid",
      name: "Raid over one hundred",
      priority: 5,
      variantConditions: [{ field: "raidViewers", operator: "min", value: 100 }]
    }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const explanation = canvas.getByRole("region", { name: "Sample selection explanation" });
    await expect(explanation).toHaveTextContent("Default plays as the fallback");
    await expect(explanation).toHaveTextContent("Sample does not match");
  }
};

export const LegacyDefaultTie: Story = {
  args: {
    alertId: "variant-legacy-tie",
    managementApi: variationStoryApi(
      selectionVariation({ id: "variant-legacy-tie", name: "Legacy tied raid", priority: 0, weight: 1 }),
      [],
      { priority: 0, weight: 3 }
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const explanation = canvas.getByRole("region", { name: "Sample selection explanation" });
    await expect(explanation).toHaveTextContent("Legacy priority tie");
    await expect(explanation).toHaveTextContent("3/4 weight · 75% relative chance");
    await expect(explanation).toHaveTextContent("1/4 weight · 25% relative chance");
  }
};

export const InvalidRange: Story = {
  args: {
    alertId: "variant-invalid-range",
    managementApi: variationStoryApi(selectionVariation({
      id: "variant-invalid-range",
      name: "Invalid range raid",
      variantConditions: [{ field: "raidViewers", operator: "range", value: [10, 20] }]
    }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const conditions = within(canvas.getByRole("group", { name: "Variation conditions" }));
    const maximum = conditions.getByRole("spinbutton", { name: "Variation conditions Raid viewers Maximum" });
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "5");
    await expect(conditions.getByRole("alert")).toHaveTextContent("Raid viewers range minimum cannot exceed its maximum.");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(canvas.getAllByRole("button", { name: "Preview" })[0]).toBeDisabled();
    await expect(canvas.getAllByRole("button", { name: "Send test" })[0]).toBeDisabled();
  }
};

export const InvalidRelativeChance: Story = {
  args: {
    alertId: "variant-invalid-relative-chance",
    managementApi: variationStoryApi(selectionVariation({
      id: "variant-invalid-relative-chance",
      name: "Invalid relative chance raid",
      weight: 1
    }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const relativeChance = canvas.getByRole("spinbutton", { name: "Relative chance" });
    await userEvent.clear(relativeChance);
    await userEvent.type(relativeChance, "0");
    await expect(relativeChance).toHaveAttribute("aria-invalid", "true");
    await expect(canvas.getByText("Relative chance must be a positive whole number.", {
      selector: "#alert-editor-relative-chance-error"
    })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(canvas.getAllByRole("button", { name: "Preview" })[0]).toBeDisabled();
    await expect(canvas.getAllByRole("button", { name: "Send test" })[0]).toBeDisabled();
    await expect(canvas.getByRole("region", { name: "Sample selection explanation" })).toHaveTextContent(
      "Correct the event settings to explain selection."
    );
  }
};

export const SharedRuleImpact: Story = {
  args: {
    alertId: "variant-shared-rule",
    managementApi: variationStoryApi(selectionVariation({ id: "variant-shared-rule", name: "Shared rule raid" }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const shared = canvas.getByRole("group", { name: "Affects default and all variations" });
    await expect(shared).toHaveTextContent("shared by the default and every variation");
    await userEvent.clear(within(shared).getByRole("spinbutton", { name: "Cooldown (seconds)" }));
    await userEvent.type(within(shared).getByRole("spinbutton", { name: "Cooldown (seconds)" }), "15");
    await expect(canvas.getByText("Unsaved")).toBeVisible();
  }
};

export const ExpandedConditionCatalog: Story = {
  args: {
    alertId: "alert-community-gift",
    managementApi: variationStoryApi(communityGiftDocument())
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const conditions = within(canvas.getByRole("group", { name: "Rule conditions" }));
    await userEvent.click(conditions.getByRole("button", { name: "Add condition" }));
    const field = conditions.getByRole("combobox", { name: "Rule conditions condition 1 field" });
    await expect(within(field).getByRole("option", { name: "Subscription tier" })).toBeVisible();
    await expect(within(field).getByRole("option", { name: "Gift count" })).toBeVisible();
    await expect(within(field).getByRole("option", { name: "Anonymous gift" })).toBeVisible();
  }
};

export const PrioritySaveFailure: Story = {
  args: {
    alertId: "variant-priority-failure",
    managementApi: variationStoryApi(
      selectionVariation({ id: "variant-priority-failure", name: "Priority failure raid", priority: 8 }),
      [variationCandidate("variant-lower-priority", "Lower priority raid", { priority: 3 })],
      {},
      {
        saveAlertEditorDocument: async () => {
          throw new Error("Priority update failed. (INTERNAL_SERVER_ERROR, err_story_priority_save)");
        }
      }
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Event" }));
    const groups = canvas.getByRole("region", { name: "Priority groups" });
    await userEvent.click(within(within(groups).getByRole("group", { name: "Priority group 2" })).getByRole("button", { name: "Move group earlier" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const dialog = within(await within(globalThis.document.body).findByRole("dialog", { name: "Save changes to active alert?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("The alert was not saved")).toBeVisible();
    await expect(within(groups).getByRole("group", { name: "Priority group 1" })).toHaveTextContent("Lower priority raid");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
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
      { key: "userName", label: "User name", description: "Display name for the event actor." }
    ],
    layers: [
      {
        id: "layer-text",
        name: "Message",
        type: "text",
        visible: true,
        order: 0,
        template: "Thanks, {userName}!",
        textStyle: structuredClone(compatibilityAlertTextStyle),
        boxStyle: structuredClone(compatibilityAlertTextBoxStyle),
        animation: preset("fade")
      },
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

function styledEditorDocument(): AlertEditorDocument {
  return {
    ...editorDocument(),
    layers: editorDocument().layers.map((layer) => layer.type === "text"
      ? {
          ...layer,
          textStyle: {
            fontPreset: "serif",
            fontSizePx: 64,
            fontWeight: 700,
            lineHeight: 1.3,
            horizontalAlign: "left",
            verticalAlign: "bottom",
            color: "#FFCC00FF",
            shadow: null
          },
          boxStyle: {
            backgroundColor: "#102030BF",
            paddingPx: 24,
            cornerRadiusPx: 18,
            shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
          }
        }
      : layer)
  };
}

function shapeEditorDocument(kind: "background" | "badge" | "hidden"): AlertEditorDocument {
  const base = editorDocument();
  const background = kind !== "badge";
  const name = kind === "hidden" ? "Hidden background" : background ? "Background" : "Badge";
  const shape = {
    id: "layer-shape",
    name,
    type: "shape" as const,
    visible: kind !== "hidden",
    order: background ? 0 : base.layers.length,
    fill: background ? "#102030BF" : "#45C4AEFF",
    animation: base.layers[0]!.animation
  };
  const layers = background
    ? [shape, ...base.layers.map((layer) => ({ ...layer, order: layer.order + 1 }))]
    : [...base.layers, shape];
  return {
    ...base,
    layers,
    targetProfiles: base.targetProfiles.map((profile) => {
      const shapeLayout = profile.id === "landscape"
        ? { layerId: shape.id, x: background ? 420 : 720, y: background ? 650 : 650, width: background ? 1080 : 480, height: background ? 260 : 140, zIndex: shape.order }
        : { layerId: shape.id, x: 190, y: background ? 1100 : 1050, width: 700, height: background ? 300 : 160, zIndex: shape.order };
      return {
        ...profile,
        layerLayouts: background
          ? [shapeLayout, ...profile.layerLayouts.map((layout) => ({ ...layout, zIndex: layout.zIndex + 1 }))]
          : [...profile.layerLayouts, shapeLayout]
      };
    }) as AlertEditorDocument["targetProfiles"]
  };
}

function shapeStoryApi(shapeDocument: AlertEditorDocument) {
  return createStoryManagementApi({
    getAlertEditorDocument: async () => shapeDocument,
    getAlertVariationAuthoringContext: async () => variationContext(shapeDocument),
    getAlertSet: async () => alertSetDetail()
  });
}

function selectionVariation(
  overrides: Partial<AlertEditorDocument> & Pick<AlertEditorDocument, "id" | "name">
): AlertEditorDocument {
  return {
    ...variationDocument(),
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: 5,
    ...overrides
  };
}

function variationCandidate(
  editorId: string,
  name: string,
  overrides: Partial<AlertVariationAuthoringContext["candidates"][number]> = {}
): AlertVariationAuthoringContext["candidates"][number] {
  return {
    editorId,
    variantId: `${editorId}-resolver`,
    kind: "variation",
    name,
    enabled: true,
    conditions: [],
    weight: 1,
    priority: 5,
    ...overrides
  };
}

function variationContext(
  document: AlertEditorDocument,
  siblings: AlertVariationAuthoringContext["candidates"] = [],
  defaultOverrides: Partial<AlertVariationAuthoringContext["candidates"][number]> = {}
): AlertVariationAuthoringContext {
  const ruleId = document.kind === "default" ? document.id : document.parentAlertId!;
  const defaultCandidate = {
    editorId: ruleId,
    variantId: `${ruleId}-default-resolver`,
    kind: "default" as const,
    name: "Default",
    enabled: document.kind === "default" ? document.enabled : true,
    conditions: [],
    weight: document.kind === "default" ? document.weight : 1,
    priority: document.kind === "default" ? document.priority : null,
    ...defaultOverrides
  };
  const selectedCandidate = document.kind === "default" ? [] : [{
    editorId: document.id,
    variantId: `${document.id}-resolver`,
    kind: "variation" as const,
    name: document.name,
    enabled: document.enabled,
    conditions: document.variantConditions,
    weight: document.weight,
    priority: document.priority
  }];
  return { ruleId, eventType: document.eventType, candidates: [defaultCandidate, ...selectedCandidate, ...siblings] };
}

function variationStoryApi(
  document: AlertEditorDocument,
  siblings: AlertVariationAuthoringContext["candidates"] = [],
  defaultOverrides: Partial<AlertVariationAuthoringContext["candidates"][number]> = {},
  overrides: Parameters<typeof createStoryManagementApi>[0] = {}
) {
  return createStoryManagementApi({
    getAlertEditorDocument: async () => document,
    getAlertVariationAuthoringContext: async () => variationContext(document, siblings, defaultOverrides),
    getAlertSet: async () => alertSetDetail(),
    ...overrides
  });
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
      { key: "userName", label: "User name", description: "Display name for the event actor." },
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
      { key: "gifterName", label: "Gifter name", description: "Display name of the community-gift sender." },
      { key: "giftCount", label: "Gift count", description: "Number of subscriptions in the aggregate community gift." },
      { key: "tier", label: "Tier", description: "Community gift tier." },
      { key: "cumulativeGifts", label: "Cumulative gifts", description: "Gifter cumulative community gift total when available." }
    ],
    layers: editorDocument().layers.map((layer) => layer.type === "text"
      ? { ...layer, template: "{gifterName} gifted {giftCount} subscriptions ({cumulativeGifts} total)!" }
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
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", parentAlertId: null, name: "New follower", kind: "default", enabled: true, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: null, name: "New raid", kind: "default", enabled: true, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}

function groupedAlertSetDetail(): AlertSetDetail {
  const source = alertSetDetail();
  const raid = source.inventory[1]!;
  return {
    ...source,
    inventory: [
      ...source.inventory,
      { ...raid, id: "variant-large-raid", parentAlertId: raid.id, name: "Large raid", kind: "variation", conditions: [{ field: "raidViewers", operator: "min", value: 50 }], weight: 2, priority: 5 },
      { ...raid, id: "variant-orphan-raid", parentAlertId: "missing-raid", name: "Orphan raid", kind: "variation" },
      { ...source.inventory[0]!, id: "future-alert", eventType: "future_celebration", name: "Future celebration" }
    ]
  };
}
