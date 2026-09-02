import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument,
  type AlertSetDetail,
  type AlertVariationAuthoringContext,
  type RegisteredProviderView,
  type TwitchCustomReward
} from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { ManagementHttpError } from "../../management-http-client.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../../navigation/dirty-navigation.js";
import {
  AlertEditorPage as ProductionAlertEditorPage,
  affectedProfileLabelsForEditor,
  completeAlertEditorSave,
  evaluateAlertEditorDraftSample,
  priorityAssignmentsForEditor,
  type AlertEditorPageApi,
  type AlertEditorPageProps
} from "./AlertEditorPage.js";
import {
  applyEditorUpdate,
  applyPriorityGroupUpdate,
  createEditorState,
  isEditorDirty,
  undoEditorUpdate
} from "./editor-state.js";

type TestAlertEditorPageProps = Omit<AlertEditorPageProps, "managementApi"> & {
  readonly managementApi: Omit<AlertEditorPageApi, "getAlertVariationAuthoringContext" | "getTwitchCustomRewards" | "previewModeration"> &
    Partial<Pick<AlertEditorPageApi, "getAlertVariationAuthoringContext" | "getTwitchCustomRewards" | "previewModeration">>;
};

function AlertEditorPage(props: TestAlertEditorPageProps) {
  const getAlertVariationAuthoringContext = props.managementApi.getAlertVariationAuthoringContext
    ?? (async (alertId: string) => variationContext(await props.managementApi.getAlertEditorDocument(alertId)));
  const previewModeration: AlertEditorPageApi["previewModeration"] = props.managementApi.previewModeration
    ?? (async (input) => ({
      target: input.target,
      settings: { maxLength: 240, blockedTerms: [], stripUrls: false },
      text: input.text,
      actions: []
    }));
  const getTwitchCustomRewards: AlertEditorPageApi["getTwitchCustomRewards"] = props.managementApi.getTwitchCustomRewards
    ?? (async () => ({ rewards: [] }));
  return <ProductionAlertEditorPage
    {...props}
    managementApi={{ ...props.managementApi, getAlertVariationAuthoringContext, getTwitchCustomRewards, previewModeration }}
  />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AlertEditorPage", () => {
  it("applies a selected starter theme only on confirmation and preserves editor history and save", async () => {
    const baseDocument = editorDocument();
    const themedSource: AlertEditorDocument = {
      ...baseDocument,
      name: "Custom celebration",
      cooldownSeconds: 12,
      rulePriority: 7,
      durationMs: 7_500,
      templateVariables: [{ key: "userName", label: "User name", description: "Display name." }],
      layers: [
        ...baseDocument.layers.map((layer) => layer.type === "text" && layer.name === "Message"
          ? { ...layer, template: "Custom hello, {userName}!" }
          : layer),
        { id: "layer-shape", name: "Backdrop", type: "shape", visible: true, order: 2, fill: "#112233FF", animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" } },
        { id: "layer-video", name: "Loop", type: "video", visible: true, order: 3, assetId: "asset-video", animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" } },
        { id: "layer-audio", name: "Sound", type: "audio", visible: true, order: 4, assetId: "asset-audio", volume: 0.4, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } },
        { id: "layer-tts", name: "Speech", type: "tts", visible: true, order: 5, enabled: true, providerId: "speakerbot", template: "Speak {userName}", animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }
      ],
      targetProfiles: baseDocument.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "ready" as const,
        layerLayouts: [
          ...profile.layerLayouts,
          { layerId: "layer-shape", x: 100, y: 100, width: 300, height: 200, zIndex: 2 },
          { layerId: "layer-video", x: 450, y: 100, width: 300, height: 200, zIndex: 3 }
        ]
      }))
    };
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={themedSource.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => themedSource),
            getAlertSet: vi.fn(async () => alertSetDetail(true)),
            listRegisteredProviders: vi.fn(async () => [activeSpeakerBot]),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    let dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    expect(dialog).toHaveTextContent("text, shape, image, and video layers");
    expect(dialog).toHaveTextContent("primary message, audio, TTS, identity, matching and variation behavior, cooldown, priority, duration, samples, and variables");
    expect(dialog).toHaveTextContent("disabled");
    expect(dialog).toHaveTextContent("both profiles");
    expect(within(dialog).getByRole("radio", { name: "Clean Signal" })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByText("Alert disabled")).toBeInTheDocument();
    expect(screen.getAllByText("Needs review").length).toBeGreaterThanOrEqual(2);
    const warning = screen.getByText("Starter theme applied.").closest(".management-toast");
    expect(warning).toHaveClass("management-toast--warning");
    expect(warning).toHaveTextContent("Review both Landscape and Vertical before saving or re-enabling.");
    expect(screen.queryByRole("dialog", { name: "Apply starter theme?" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getAllByText("Alert enabled").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("Alert disabled")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getAllByText("Alert enabled").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    expect(within(dialog).getByRole("radio", { name: "Clean Signal" })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saveDialog = screen.getByRole("dialog", { name: "Save changes to active alert?" });
    await user.click(within(saveDialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    const saved = saveAlertEditorDocument.mock.calls[0]![1];
    expect(saved).toMatchObject({ name: "Custom celebration", enabled: false, cooldownSeconds: 12, rulePriority: 7, durationMs: 7_500 });
    expect(saved.layers.map(({ id }) => id)).not.toEqual(expect.arrayContaining(["layer-text", "layer-image", "layer-shape", "layer-video"]));
    expect(saved.layers.filter((layer) => ["image", "video"].includes(layer.type))).toEqual([]);
    expect(saved.layers.find((layer) => layer.type === "text" && layer.name === "Message")).toMatchObject({ template: "Custom hello, {userName}!" });
    expect(saved.layers.find((layer) => layer.type === "audio")).toMatchObject({ assetId: "asset-audio", volume: 0.4 });
    expect(saved.layers.find((layer) => layer.type === "tts")).toMatchObject({ providerId: "speakerbot", template: "Speak {userName}" });
    expect(saved.targetProfiles.map(({ enabled, reviewState }) => ({ enabled, reviewState }))).toEqual([
      { enabled: true, reviewState: "needs-review" },
      { enabled: true, reviewState: "needs-review" }
    ]);

    await user.click(screen.getByRole("tab", { name: "Layers" }));
    await user.click(screen.getByText("Message", { selector: ".alert-editor-inspector__layer-list span" }).closest("button")!);
    await user.clear(screen.getByRole("textbox", { name: "Message template" }));
    await user.type(screen.getByRole("textbox", { name: "Message template" }), "Ordinary edit after save");
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).toBeInTheDocument();
  });

  it("keeps the Layers inspector selection valid and clears stale theme guidance across history", async () => {
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const message = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(message);
    await user.type(message, "Before theme");
    await user.click(screen.getByText("Celebration", { selector: ".alert-editor-inspector__layer-list span" }).closest("button")!);
    await user.click(screen.getByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    const dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    await user.click(screen.getByRole("tab", { name: "Layers" }));

    expect(screen.queryByText("Select a layer to edit it.")).not.toBeInTheDocument();
    expect(screen.queryByText("Celebration", { selector: ".alert-editor-inspector__layer-list span" })).not.toBeInTheDocument();
    expect(screen.getByText("Starter theme applied.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByText("Message", { selector: ".alert-editor-inspector__layer-list span" }).closest("div")).toHaveClass("is-selected"));
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Before theme");
    expect(screen.queryByText("Starter theme applied.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    let switchDialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    await user.click(within(switchDialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() => expect(screen.queryByText("Select a layer to edit it.")).not.toBeInTheDocument());
    expect(screen.getByText("Starter theme applied.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(screen.getByText("Message", { selector: ".alert-editor-inspector__layer-list span" }).closest("div")).toHaveClass("is-selected"));
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Thanks, {userName}!");
    expect(screen.queryByText("Starter theme applied.")).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved changes reverted.")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Message template" }));
    await user.type(screen.getByRole("textbox", { name: "Message template" }), "Ordinary edit after revert");
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    switchDialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    expect(switchDialog).toBeInTheDocument();
  });

  it("preserves theme review provenance across multiple theme applications and history", async () => {
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    let dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    await user.click(within(dialog).getByRole("radio", { name: "Bold Pop" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Starter theme applied.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("Starter theme applied.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();
  });

  it("tracks same-theme reapplication through themed and ordinary history branches", async () => {
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const initialMessage = await screen.findByRole("textbox", { name: "Message template" });
    fireEvent.change(initialMessage, { target: { value: "Before themes" } });
    await user.click(screen.getByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    await user.click(within(screen.getByRole("dialog", { name: "Apply starter theme?" })).getByRole("button", { name: "Apply theme" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    await user.click(within(screen.getByRole("dialog", { name: "Apply starter theme?" })).getByRole("button", { name: "Apply theme" }));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("tab", { name: "Layers" }));
    await user.click(screen.getByText("Message", { selector: ".alert-editor-inspector__layer-list span" }).closest("button")!);
    const themedMessage = screen.getByRole("textbox", { name: "Message template" });
    fireEvent.change(themedMessage, { target: { value: "Themed branch" } });
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Before themes");
    fireEvent.change(screen.getByRole("textbox", { name: "Message template" }), { target: { value: "Before themes branched" } });
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    expect(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).toBeInTheDocument();
  });

  it("keeps an invalid transient draft intact when starter-theme application fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    const duration = screen.getByRole("spinbutton", { name: "Duration (milliseconds)" });
    fireEvent.change(duration, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    await user.click(within(screen.getByRole("dialog", { name: "Apply starter theme?" })).getByRole("button", { name: "Apply theme" }));

    expect(await screen.findByText("The starter theme was not applied")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Apply starter theme?" })).toBeInTheDocument();
    expect(duration).toHaveValue(0);
    expect(screen.getAllByText("Alert enabled").length).toBeGreaterThan(0);
  });
  it("waits for valid variation context and blocks the editor when context loading fails", async () => {
    let resolveContext: ((context: AlertVariationAuthoringContext) => void) | undefined;
    const contextResult = new Promise<AlertVariationAuthoringContext>((resolve) => { resolveContext = resolve; });
    const document = editorDocument();
    const commonApi = {
      getAlertEditorDocument: vi.fn(async () => document),
      getAlertSet: vi.fn(async () => alertSetDetail(false)),
      listRegisteredProviders: vi.fn(async () => []),
      getAssetChangeImpact: vi.fn(),
      listAssetLibraryItems: vi.fn(async () => []),
      deleteAsset: vi.fn(),
      updateAssetMetadata: vi.fn(),
      saveAlertEditorDocument: vi.fn(),
      sendAlertEditorTest: vi.fn()
    };
    const view = render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            ...commonApi,
            getAlertVariationAuthoringContext: vi.fn(() => contextResult)
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByText("Loading alert editor...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: document.name })).not.toBeInTheDocument();
    await act(async () => { resolveContext?.(variationContext(document)); });
    expect(await screen.findByRole("heading", { name: document.name })).toBeInTheDocument();
    view.unmount();

    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            ...commonApi,
            getAlertVariationAuthoringContext: vi.fn(async () => { throw new Error("context unavailable"); })
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: document.name })).not.toBeInTheDocument();
  });

  it("rejects a variation context belonging to another rule", async () => {
    const document: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-raid-high",
      parentAlertId: "alert-raid",
      kind: "variation",
      eventType: "raid"
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertVariationAuthoringContext: vi.fn(async () => ({
              ...variationContext(document),
              ruleId: "alert-another-rule"
            })),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: document.name })).not.toBeInTheDocument();
  });

  it("rejects a default context whose rule ID is not the document ID", async () => {
    const document = editorDocument();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertVariationAuthoringContext: vi.fn(async () => ({
              ...variationContext(document),
              ruleId: "alert-another-rule"
            })),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: document.name })).not.toBeInTheDocument();
  });

  it("builds complete assignments only for changed groups and maps editor IDs to resolver variant IDs", () => {
    const selected: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-editor-high",
      parentAlertId: "alert-raid",
      kind: "variation",
      eventType: "raid",
      priority: 9
    };
    const context = variationContext(selected, [{
      editorId: "variant-editor-low",
      variantId: "variant-resolver-low",
      kind: "variation",
      name: "Low",
      enabled: true,
      conditions: [],
      weight: 1,
      priority: 3
    }]);
    const initialGroups = [
      { variationIds: ["variant-editor-high"] },
      { variationIds: ["variant-editor-low"] }
    ] as const;
    const initial = createEditorState(selected, initialGroups);

    expect(priorityAssignmentsForEditor(initial, context)).toBeUndefined();

    const changed = applyPriorityGroupUpdate(initial, (groups) => [groups[1]!, groups[0]!]);
    expect(priorityAssignmentsForEditor(changed, context)).toEqual([
      { variationId: "variant-resolver-low", priority: 2 },
      { variationId: "variant-editor-high-resolver", priority: 1 }
    ]);

    const sameMembership = createEditorState(selected, [{
      variationIds: ["variant-editor-high", "variant-editor-low"]
    }]);
    const reorderedMembership = applyPriorityGroupUpdate(sameMembership, () => [{
      variationIds: ["variant-editor-low", "variant-editor-high"]
    }]);
    expect(reorderedMembership).toBe(sameMembership);
    expect(priorityAssignmentsForEditor(reorderedMembership, context)).toBeUndefined();
  });

  it("excludes disabled sibling profiles from a group-only dirty draft impact", () => {
    const selected: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-editor-high",
      parentAlertId: "alert-raid",
      kind: "variation",
      eventType: "raid"
    };
    const context = variationContext(selected, [{
      editorId: "variant-editor-low",
      variantId: "variant-resolver-low",
      kind: "variation",
      name: "Low",
      enabled: true,
      conditions: [],
      weight: 1,
      priority: 3
    }]);
    const changed = applyPriorityGroupUpdate(
      createEditorState(selected, [
        { variationIds: ["variant-editor-high"] },
        { variationIds: ["variant-editor-low"] }
      ]),
      (groups) => [groups[1]!, groups[0]!]
    );
    const detail = alertSetDetail(true);
    const siblingDetail: AlertSetDetail = {
      ...detail,
      inventory: [
        ...detail.inventory,
        { id: "variant-editor-high", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "High", kind: "variation", enabled: true, conditions: [], weight: 1, priority: 3, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "High" },
        { id: "variant-editor-low", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "Low", kind: "variation", enabled: false, conditions: [], weight: 1, priority: 3, reviewState: "ready", targetProfileIds: ["vertical"], previewText: "Low" }
      ]
    };

    expect(affectedProfileLabelsForEditor(changed, siblingDetail, context)).toEqual(["Landscape"]);

    const disabledSelected = applyPriorityGroupUpdate(
      createEditorState({ ...selected, enabled: false }, [
        { variationIds: ["variant-editor-high"] },
        { variationIds: ["variant-editor-low"] }
      ]),
      (groups) => [groups[1]!, groups[0]!]
    );
    const noEnabledCandidates: AlertSetDetail = {
      ...detail,
      inventory: [
        { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: null, name: "Default", kind: "default", enabled: false, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Default" },
        { id: "variant-editor-high", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "High", kind: "variation", enabled: true, conditions: [], weight: 1, priority: 3, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "High" },
        { id: "variant-editor-low", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "Low", kind: "variation", enabled: false, conditions: [], weight: 1, priority: 3, reviewState: "ready", targetProfileIds: ["vertical"], previewText: "Low" }
      ]
    };
    expect(affectedProfileLabelsForEditor(disabledSelected, noEnabledCandidates, context)).toEqual([]);
  });

  it("includes enabled sibling target profiles when a disabled variation changes shared rule settings", () => {
    const selected = raidVariationDocument({
      id: "variant-editor-disabled",
      name: "Disabled variation",
      enabled: false
    });
    const context = variationContext(selected, [
      variationCandidate("variant-editor-vertical", "Vertical sibling")
    ]);
    const changed = applyEditorUpdate(
      createEditorState(selected, [
        { variationIds: ["variant-editor-disabled", "variant-editor-vertical"] }
      ]),
      (document) => ({ ...document, cooldownSeconds: 15 })
    );
    const detail: AlertSetDetail = {
      ...alertSetDetail(true),
      inventory: [
        { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: null, name: "Default", kind: "default", enabled: true, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Default" },
        { id: "variant-editor-disabled", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "Disabled variation", kind: "variation", enabled: false, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Disabled" },
        { id: "variant-editor-vertical", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: "alert-raid", name: "Vertical sibling", kind: "variation", enabled: true, conditions: [], weight: 1, priority: null, reviewState: "ready", targetProfileIds: ["vertical"], previewText: "Vertical" }
      ]
    };

    expect(affectedProfileLabelsForEditor(changed, detail, context)).toEqual(["Landscape", "Vertical"]);
  });

  it("preserves document and group edits made while an earlier save is pending", () => {
    const selected = editorDocument();
    const initialGroups = [
      { variationIds: ["variant-high"] },
      { variationIds: ["variant-low"] }
    ] as const;
    const submitted = applyPriorityGroupUpdate(
      createEditorState(selected, initialGroups),
      (groups) => [groups[1]!, groups[0]!]
    );
    const pending = applyPriorityGroupUpdate(
      { ...submitted, document: { ...submitted.document, name: "Newer local edit" } },
      (groups) => [{ variationIds: [...groups[0]!.variationIds, "variant-new"] }, groups[1]!]
    );
    const savedDocument = { ...selected, name: "Saved response" };

    const completed = completeAlertEditorSave(
      pending,
      submitted.document,
      submitted.priorityGroups,
      savedDocument
    );

    expect(completed.document.name).toBe("Newer local edit");
    expect(completed.priorityGroups[0]?.variationIds).toContain("variant-new");
    expect(completed.savedDocument).toBe(savedDocument);
    expect(completed.savedPriorityGroups).toBe(submitted.priorityGroups);
  });

  it("settles unchanged groups while preserving a document-only edit made during save", () => {
    const selected = editorDocument();
    const initial = createEditorState(selected, [{ variationIds: ["variant-high"] }]);
    const submitted = applyEditorUpdate(initial, (document) => ({ ...document, name: "Submitted" }));
    const pending = applyEditorUpdate(submitted, (document) => ({ ...document, name: "Newer local edit" }));
    const savedDocument = { ...submitted.document, name: "Saved response" };

    const completed = completeAlertEditorSave(
      pending,
      submitted.document,
      submitted.priorityGroups,
      savedDocument
    );

    expect(completed.document.name).toBe("Newer local edit");
    expect(completed.savedDocument).toBe(savedDocument);
    expect(completed.priorityGroups).toBe(submitted.priorityGroups);
    expect(completed.savedPriorityGroups).toBe(submitted.priorityGroups);
    expect(completed.past).toEqual([{ document: savedDocument, priorityGroups: submitted.priorityGroups }]);
    expect(isEditorDirty(completed)).toBe(true);
    expect(isEditorDirty(undoEditorUpdate(completed))).toBe(false);
  });

  it("settles the saved document while preserving a group-only edit made during save", () => {
    const selected = editorDocument();
    const initial = createEditorState(selected, [
      { variationIds: ["variant-high"] },
      { variationIds: ["variant-low"] }
    ]);
    const submitted = applyEditorUpdate(initial, (document) => ({ ...document, name: "Submitted" }));
    const pending = applyPriorityGroupUpdate(submitted, (groups) => [groups[1]!, groups[0]!]);
    const savedDocument = { ...submitted.document, name: "Saved response" };

    const completed = completeAlertEditorSave(
      pending,
      submitted.document,
      submitted.priorityGroups,
      savedDocument
    );

    expect(completed.document).toBe(savedDocument);
    expect(completed.savedDocument).toBe(savedDocument);
    expect(completed.priorityGroups).toBe(pending.priorityGroups);
    expect(completed.savedPriorityGroups).toBe(submitted.priorityGroups);
    expect(completed.past).toEqual([{ document: savedDocument, priorityGroups: submitted.priorityGroups }]);
    expect(isEditorDirty(completed)).toBe(true);
    expect(isEditorDirty(undoEditorUpdate(completed))).toBe(false);
  });

  it("evaluates the current selected draft with normalized group assignments and resolver IDs", () => {
    const selected: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-editor-high",
      parentAlertId: "alert-raid",
      kind: "variation",
      eventType: "raid",
      enabled: true,
      variantConditions: [{ field: "raidViewers", operator: "min", value: 20 }],
      weight: 4,
      priority: 9
    };
    const context = variationContext(selected, [{
      editorId: "variant-editor-low",
      variantId: "variant-resolver-low",
      kind: "variation",
      name: "Low",
      enabled: true,
      conditions: [],
      weight: 1,
      priority: 3
    }]);
    const editor = applyPriorityGroupUpdate(
      createEditorState(selected, [
        { variationIds: ["variant-editor-high"] },
        { variationIds: ["variant-editor-low"] }
      ]),
      (groups) => [groups[1]!, groups[0]!]
    );

    const evaluation = evaluateAlertEditorDraftSample(editor, context, {
      userName: "Raider",
      raidViewers: 25,
      amount: 25
    });

    expect(evaluation).toMatchObject({
      outcome: "weighted-candidates",
      highestEligiblePriority: 2,
      candidates: [
        { id: "alert-raid-default-resolver", inHighestEligibleGroup: false },
        { id: "variant-editor-high-resolver", conditionsMatch: true, inHighestEligibleGroup: false },
        { id: "variant-resolver-low", conditionsMatch: true, inHighestEligibleGroup: true }
      ]
    });
  });

  it("uses the selected document provider when a built-in sample omits the event source", () => {
    const selected = raidVariationDocument({
      id: "variant-streamerbot",
      name: "Streamer.bot raid",
      providerKind: "streamerbot",
      conditions: [{ field: "ingestProvider", operator: "equals", value: "streamerbot" }]
    });

    const evaluation = evaluateAlertEditorDraftSample(
      createEditorState(selected, [{ variationIds: [selected.id] }]),
      variationContext(selected),
      { userName: "Raider", raidViewers: 50, amount: 50 }
    );

    expect(evaluation.ruleMatches).toBe(true);
    expect(evaluation.outcome).toBe("weighted-candidates");
  });

  it("authors ordered priority groups without implying within-group order or mixing in the fallback", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-high", name: "High", priority: 10 });
    renderVariationSelectionEditor(selected, [
      variationCandidate("variant-mid", "Middle", { priority: 5, weight: 3 }),
      variationCandidate("variant-disabled", "Disabled", { enabled: false, priority: 5 })
    ]);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const groups = screen.getByRole("region", { name: "Priority groups" });
    const fallback = within(groups).getByRole("group", { name: "Fallback" });
    expect(fallback).toHaveTextContent("Default");
    expect(within(fallback).queryByRole("combobox")).not.toBeInTheDocument();

    const first = within(groups).getByRole("group", { name: "Priority group 1" });
    const second = within(groups).getByRole("group", { name: "Priority group 2" });
    expect(first).toHaveTextContent("evaluated first");
    expect(second).toHaveTextContent("evaluated last");
    expect(within(first).getByRole("button", { name: "Move group earlier" })).toBeDisabled();
    expect(within(first).getByRole("button", { name: "Move group later" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Move group earlier" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Move group later" })).toBeDisabled();
    expect(within(groups).queryByRole("button", { name: /move (high|middle|disabled) (earlier|later)/iu })).not.toBeInTheDocument();
    expect(second).toHaveTextContent("Disabled");

    await user.selectOptions(within(first).getByRole("combobox", { name: "Move High to priority group" }), "1");
    expect(within(groups).queryByRole("group", { name: "Priority group 2" })).not.toBeInTheDocument();
    const joined = within(groups).getByRole("group", { name: "Priority group 1" });
    expect(joined).toHaveTextContent("High");
    expect(joined).toHaveTextContent("Middle");

    await user.selectOptions(within(joined).getByRole("combobox", { name: "Move Middle to priority group" }), "new-last");
    expect(within(groups).getByRole("group", { name: "Priority group 2" })).toHaveTextContent("Middle");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(groups).queryByRole("group", { name: "Priority group 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(within(screen.getByRole("region", { name: "Priority groups" })).getByRole("group", { name: "Priority group 2" })).toHaveTextContent("Middle");
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("shows an unsaved selected variation rename and toggle consistently", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-draft", name: "Saved variation", priority: 5 });
    renderVariationSelectionEditor(selected, []);

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    const name = screen.getByRole("textbox", { name: "Alert name" });
    await user.clear(name);
    await user.type(name, "Draft variation");
    await user.click(screen.getByRole("checkbox", { name: "Alert enabled" }));
    expect(screen.getByRole("heading", { name: "Draft variation" })).toBeVisible();
    expect(screen.getByText("Alert disabled")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Event" }));
    const groups = screen.getByRole("region", { name: "Priority groups" });
    const group = within(groups).getByRole("group", { name: "Priority group 1" });
    expect(group).toHaveTextContent("Draft variation");
    expect(group).toHaveTextContent("Disabled");
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("Draft variation");
    expect(explanation).toHaveTextContent("Disabled — not a candidate.");
    expect(explanation).not.toHaveTextContent("Saved variation");
  });

  it("shows an unsaved selected default rename and toggle consistently", async () => {
    const user = userEvent.setup();
    const selected = {
      ...editorDocument(),
      id: "alert-raid",
      eventType: "raid" as const,
      name: "Saved default",
      samplePayloads: [{
        id: "normal",
        label: "Normal raid",
        kind: "built-in" as const,
        payload: { userName: "Raider", raidViewers: 50, amount: 50 }
      }]
    };
    renderVariationSelectionEditor(selected, [variationCandidate("variant-sibling", "Sibling")]);

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    const name = screen.getByRole("textbox", { name: "Alert name" });
    await user.clear(name);
    await user.type(name, "Draft default");
    await user.click(screen.getByRole("checkbox", { name: "Alert enabled" }));
    expect(screen.getByRole("heading", { name: "Draft default" })).toBeVisible();
    expect(screen.getByText("Alert disabled")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Event" }));
    const groups = screen.getByRole("region", { name: "Priority groups" });
    const fallback = within(groups).getByRole("group", { name: "Fallback" });
    expect(fallback).toHaveTextContent("Draft default");
    expect(fallback).toHaveTextContent("Disabled default alert");
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("Draft default");
    expect(explanation).toHaveTextContent("Disabled — not a candidate.");
    expect(explanation).not.toHaveTextContent("Saved default");
  });

  it("retains priority membership and condition drafts after a failed atomic save, then sends exact assignments", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-high", name: "High", priority: 10 });
    const saveAlertEditorDocument = vi.fn<AlertEditorPageApi["saveAlertEditorDocument"]>()
      .mockRejectedValueOnce(new Error("Database write failed. Reference ref-priority-save."))
      .mockImplementation(async (_alertId, document) => document);
    renderVariationSelectionEditor(selected, [
      variationCandidate("variant-low", "Low", { priority: 5 })
    ], { saveAlertEditorDocument });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const groups = screen.getByRole("region", { name: "Priority groups" });
    await user.click(within(within(groups).getByRole("group", { name: "Priority group 2" }))
      .getByRole("button", { name: "Move group earlier" }));
    const conditions = screen.getByRole("group", { name: "Variation conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(
      within(conditions).getByRole("combobox", { name: "Variation conditions Raid viewers operator" }),
      "range"
    );
    const minimum = within(conditions).getByRole("spinbutton", { name: "Variation conditions Raid viewers Minimum" });
    const maximum = within(conditions).getByRole("spinbutton", { name: "Variation conditions Raid viewers Maximum" });
    await user.clear(maximum);
    await user.type(maximum, "50");
    await user.clear(minimum);
    await user.type(minimum, "10");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The alert was not saved")).toBeVisible();
    expect(within(groups).getByRole("group", { name: "Priority group 1" })).toHaveTextContent("Low");
    expect(minimum).toHaveValue(10);
    expect(maximum).toHaveValue(50);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenLastCalledWith(
      selected.id,
      expect.objectContaining({
        variantConditions: [{ field: "raidViewers", operator: "range", value: [10, 50] }]
      }),
      false,
      [
        { variationId: "variant-low-resolver", priority: 2 },
        { variationId: "variant-high-resolver", priority: 1 }
      ]
    ));
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("explains weighted top candidates, lower groups, disabled siblings, and a legacy default tie from core evaluation", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-quarter", name: "Quarter", priority: 8, weight: 1 });
    renderVariationSelectionEditor(selected, [
      variationCandidate("variant-three-quarters", "Three quarters", { priority: 8, weight: 3 }),
      variationCandidate("variant-lower", "Lower", { priority: 3 }),
      variationCandidate("variant-disabled", "Disabled", { enabled: false, priority: 8 })
    ]);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("Quarter");
    expect(explanation).toHaveTextContent("1/4 weight · 25% relative chance");
    expect(explanation).toHaveTextContent("Three quarters");
    expect(explanation).toHaveTextContent("3/4 weight · 75% relative chance");
    expect(explanation).toHaveTextContent("Live selection remains random.");
    expect(explanation).toHaveTextContent("Lower");
    expect(explanation).toHaveTextContent("higher-priority group");
    expect(explanation).toHaveTextContent("Disabled");
    expect(explanation).toHaveTextContent("Disabled — not a candidate.");
    expect(explanation).toHaveTextContent("Fallback only");
    expect(explanation).not.toHaveTextContent("Legacy priority tie");
  });

  it("blocks invalid relative chance drafts until a positive whole number is restored", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-chance", name: "Chance", priority: 8, weight: 1 });
    renderVariationSelectionEditor(selected, []);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const chance = screen.getByRole("spinbutton", { name: "Relative chance" });
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("1/1 weight · 100% relative chance");

    for (const invalidValue of ["", "0", "-1", "1.5"]) {
      fireEvent.change(chance, { target: { value: invalidValue } });

      expect(chance).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Relative chance must be a positive whole number.", { selector: "#alert-editor-relative-chance-error" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getAllByRole("button", { name: "Preview" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
      expect(screen.getAllByRole("button", { name: "Send test" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
      expect(explanation).toHaveTextContent("Correct the event settings to explain selection.");
      expect(explanation).not.toHaveTextContent(/relative chance|live selection|fallback/iu);
    }

    fireEvent.change(chance, { target: { value: "4" } });

    expect(chance).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Relative chance must be a positive whole number.", { selector: "#alert-editor-relative-chance-error" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(explanation).toHaveTextContent("4/4 weight · 100% relative chance");
  });

  it("explains rule mismatch, one candidate, fallback, no enabled candidate, and legacy ties", async () => {
    const scenarios: readonly {
      readonly document: AlertEditorDocument;
      readonly siblings: readonly AlertVariationAuthoringContext["candidates"][number][];
      readonly defaultEnabled?: boolean;
      readonly defaultPriority?: number | null;
      readonly defaultWeight?: number;
      readonly expected: readonly string[];
    }[] = [
      {
        document: raidVariationDocument({
          id: "variant-rule-mismatch",
          name: "Rule mismatch",
          priority: 5,
          conditions: [{ field: "raidViewers", operator: "min" as const, value: 100 }]
        }),
        siblings: [],
        expected: ["No alert plays", "Raid viewers is at least 100"]
      },
      {
        document: raidVariationDocument({ id: "variant-only", name: "Only candidate", priority: 5 }),
        siblings: [],
        expected: ["Only candidate", "1/1 weight · 100% relative chance"]
      },
      {
        document: raidVariationDocument({
          id: "variant-no-match",
          name: "Does not match",
          priority: 5,
          variantConditions: [{ field: "raidViewers", operator: "min" as const, value: 100 }]
        }),
        siblings: [],
        expected: ["Default plays as the fallback", "Does not match", "Sample does not match"]
      },
      {
        document: raidVariationDocument({ id: "variant-disabled-only", name: "Disabled only", enabled: false, priority: 5 }),
        siblings: [],
        defaultEnabled: false,
        expected: ["No enabled alert can play", "Disabled only"]
      },
      {
        document: raidVariationDocument({ id: "variant-tied", name: "Tied variation", priority: 0, weight: 1 }),
        siblings: [],
        defaultPriority: 0,
        defaultWeight: 3,
        expected: ["Legacy priority tie", "Default", "3/4 weight · 75% relative chance", "Tied variation", "1/4 weight · 25% relative chance", "explicit priority group edit"]
      }
    ];

    for (const scenario of scenarios) {
      const user = userEvent.setup();
      const view = renderVariationSelectionEditor(scenario.document, scenario.siblings, {
        ...(scenario.defaultEnabled === undefined ? {} : { defaultEnabled: scenario.defaultEnabled }),
        ...(scenario.defaultPriority === undefined ? {} : { defaultPriority: scenario.defaultPriority }),
        ...(scenario.defaultWeight === undefined ? {} : { defaultWeight: scenario.defaultWeight })
      });
      await user.click(await screen.findByRole("tab", { name: "Event" }));
      const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
      for (const copy of scenario.expected) expect(explanation).toHaveTextContent(copy);
      view.unmount();
    }
  });

  it("names only failing shared rule conditions in the sample diagnostic", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({
      id: "variant-mixed-rule",
      name: "Mixed rule",
      conditions: [
        { field: "raidViewers", operator: "min", value: 20 },
        { field: "raidViewers", operator: "max", value: 40 }
      ]
    });
    renderVariationSelectionEditor(selected, []);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("No alert plays for this sample.");
    expect(explanation).toHaveTextContent("Raid viewers is at most 40");
    expect(explanation).not.toHaveTextContent("Raid viewers is at least 20");
  });

  it("suppresses stale selection percentages while sample or condition input needs correction", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-quarter", name: "Quarter", priority: 8, weight: 1 });
    renderVariationSelectionEditor(selected, [
      variationCandidate("variant-three-quarters", "Three quarters", { priority: 8, weight: 3 })
    ]);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    expect(screen.getByRole("region", { name: "Sample selection explanation" })).toHaveTextContent("25% relative chance");
    const sample = screen.getByRole("textbox", { name: "Session payload (JSON)" });
    fireEvent.change(sample, { target: { value: "{" } });
    const invalidSample = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(invalidSample).toHaveTextContent("Correct the sample payload to explain selection.");
    expect(invalidSample).not.toHaveTextContent(/relative chance|live selection|fallback/iu);

    fireEvent.change(sample, { target: { value: JSON.stringify({ userName: "Raider", raidViewers: 50, amount: 50 }) } });
    const conditions = screen.getByRole("group", { name: "Variation conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    const value = within(conditions).getByRole("spinbutton", { name: "Variation conditions Raid viewers value" });
    await user.clear(value);
    await user.type(value, "0");
    const invalidCondition = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(invalidCondition).toHaveTextContent("Correct the event settings to explain selection.");
    expect(invalidCondition).not.toHaveTextContent(/relative chance|live selection|fallback/iu);
  });

  it("keeps Save available for valid persisted edits when the session sample is invalid", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({ id: "variant-invalid-sample", name: "Invalid sample" });
    const saveAlertEditorDocument = vi.fn<AlertEditorPageApi["saveAlertEditorDocument"]>(
      async (_alertId, document) => document
    );
    renderVariationSelectionEditor(selected, [], { saveAlertEditorDocument });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Relative chance" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Session payload (JSON)" }), { target: { value: "{" } });

    expect(screen.getAllByRole("button", { name: /preview/iu }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getAllByRole("button", { name: "Send test" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      selected.id,
      expect.objectContaining({ weight: 2 }),
      false
    ));
  });

  it("turns a server-required live-impact response into a retryable confirmation", async () => {
    const user = userEvent.setup();
    const selected = raidVariationDocument({
      id: "variant-server-impact",
      name: "Server impact",
      enabled: false
    });
    const saveAlertEditorDocument = vi.fn<AlertEditorPageApi["saveAlertEditorDocument"]>()
      .mockRejectedValueOnce(new ManagementHttpError(
        "Saving can change active live output for landscape.",
        "ALERT_EDITOR_LIVE_IMPACT_CONFIRMATION_REQUIRED",
        null
      ))
      .mockImplementation(async (_alertId, document) => document);
    renderVariationSelectionEditor(selected, [], { saveAlertEditorDocument });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const cooldown = screen.getByRole("spinbutton", { name: "Cooldown (seconds)" });
    await user.clear(cooldown);
    await user.type(cooldown, "15");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const confirmation = await screen.findByRole("dialog", { name: "Save changes to active alert?" });
    expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      selected.id,
      expect.objectContaining({ cooldownSeconds: 15 }),
      false
    );
    await user.click(within(confirmation).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenLastCalledWith(
      selected.id,
      expect.objectContaining({ cooldownSeconds: 15 }),
      true
    ));
  });

  it("edits and validates text-only typography and box styles", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByText("Typography", { selector: "summary" });
    const disclosures = [
      ["Typography", "Font size"],
      ["Text box", "Padding"],
      ["Position and size", "X"],
      ["Animation preset", "Animation duration (milliseconds)"]
    ] as const;
    for (const [label, controlLabel] of disclosures) {
      const summary = screen.getByText(label, { selector: "summary" });
      expect(summary.closest("details")).not.toHaveAttribute("open");
      const control = screen.getByLabelText(controlLabel);
      expect(control).not.toBeVisible();
      await user.click(summary);
      expect(summary.closest("details")).toHaveAttribute("open");
      expect(control).toBeVisible();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    }
    const typography = screen.getByRole("group", { name: "Typography" });
    const textBox = screen.getByRole("group", { name: "Text box" });
    const initialFontSize = within(typography).getByLabelText("Font size");
    expect(initialFontSize).toHaveValue(32);

    await user.click(screen.getByRole("button", { name: "100%" }));
    await user.selectOptions(within(typography).getByLabelText("Font preset"), "serif");
    await user.clear(within(typography).getByLabelText("Font size"));
    await user.type(within(typography).getByLabelText("Font size"), "64");
    await user.selectOptions(within(typography).getByLabelText("Font weight"), "700");
    fireEvent.change(within(typography).getByLabelText("Line height"), { target: { value: "1.45" } });
    await user.selectOptions(within(typography).getByLabelText("Horizontal alignment"), "left");
    await user.selectOptions(within(typography).getByLabelText("Vertical alignment"), "bottom");
    fireEvent.change(within(typography).getByLabelText("Text color color"), {
      target: { value: "#abcdef" }
    });
    fireEvent.change(within(typography).getByLabelText("Text color opacity"), {
      target: { value: "50" }
    });
    fireEvent.change(within(typography).getByLabelText("Text shadow horizontal offset"), {
      target: { value: "-5" }
    });
    fireEvent.change(within(typography).getByLabelText("Text shadow vertical offset"), {
      target: { value: "7" }
    });
    fireEvent.change(within(typography).getByLabelText("Text shadow blur"), {
      target: { value: "20" }
    });
    fireEvent.change(within(typography).getByLabelText("Text shadow color color"), {
      target: { value: "#112233" }
    });
    fireEvent.change(within(typography).getByLabelText("Text shadow color opacity"), {
      target: { value: "40" }
    });
    fireEvent.change(within(textBox).getByLabelText("Background color color"), {
      target: { value: "#102030" }
    });
    fireEvent.change(within(textBox).getByLabelText("Background color opacity"), {
      target: { value: "75" }
    });
    await user.clear(within(textBox).getByLabelText("Padding"));
    await user.type(within(textBox).getByLabelText("Padding"), "24");
    await user.clear(within(textBox).getByLabelText("Corner radius"));
    await user.type(within(textBox).getByLabelText("Corner radius"), "18");
    await user.click(within(textBox).getByLabelText("Box shadow"));
    fireEvent.change(within(textBox).getByLabelText("Box shadow horizontal offset"), {
      target: { value: "3" }
    });
    fireEvent.change(within(textBox).getByLabelText("Box shadow vertical offset"), {
      target: { value: "9" }
    });
    fireEvent.change(within(textBox).getByLabelText("Box shadow blur"), {
      target: { value: "16" }
    });
    fireEvent.change(within(textBox).getByLabelText("Box shadow color color"), {
      target: { value: "#445566" }
    });
    fireEvent.change(within(textBox).getByLabelText("Box shadow color opacity"), {
      target: { value: "60" }
    });

    expect(screen.getByText("Thanks, James!").style.fontFamily).toBe('Georgia, "Times New Roman", serif');
    expect(screen.getByText("Thanks, James!").style.fontSize).toBe("64px");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({
        layers: expect.arrayContaining([
          expect.objectContaining({
            textStyle: expect.objectContaining({
              fontPreset: "serif",
              fontSizePx: 64,
              fontWeight: 700,
              lineHeight: 1.45,
              horizontalAlign: "left",
              verticalAlign: "bottom",
              color: "#ABCDEF80",
              shadow: {
                offsetX: -5,
                offsetY: 7,
                blur: 20,
                color: "#11223366"
              }
            }),
            boxStyle: expect.objectContaining({
              backgroundColor: "#102030BF",
              paddingPx: 24,
              cornerRadiusPx: 18,
              shadow: {
                offsetX: 3,
                offsetY: 9,
                blur: 16,
                color: "#44556699"
              }
            })
          })
        ])
      }),
      false
    ));

    const fontSize = within(typography).getByLabelText("Font size");
    fireEvent.change(fontSize, { target: { value: "513" } });
    expect(fontSize).toHaveAttribute("aria-invalid", "true");
    expect(within(typography).getByRole("alert")).toHaveTextContent("Font size must be between 8 and 512.");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(typography).getByLabelText("Font size")).toHaveValue(64);
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(within(typography).getByLabelText("Font size")).toHaveValue(513);

    fireEvent.change(within(typography).getByLabelText("Line height"), { target: { value: "3.01" } });
    expect(within(typography).getByText("Line height must be between 0.75 and 3.")).toBeVisible();
    fireEvent.change(within(typography).getByLabelText("Text shadow horizontal offset"), {
      target: { value: "1.5" }
    });
    expect(within(typography).getByText(
      "Text shadow horizontal offset must be a whole number between -256 and 256."
    )).toBeVisible();
    fireEvent.change(within(textBox).getByLabelText("Padding"), { target: { value: "257" } });
    expect(within(textBox).getByText("Padding must be between 0 and 256.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /CelebrationImage/u }));
    expect(screen.queryByRole("group", { name: "Typography" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Text box" })).not.toBeInTheDocument();
  });

  it("keeps Add Shape available during an unrelated invalid text-style draft", async () => {
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const typographySummary = await screen.findByText("Typography", { selector: "summary" });
    await user.click(typographySummary);
    fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "513" } });

    const visualStyleCorrection = screen.getByText(/^Visual styles need correction:/u);
    expect(visualStyleCorrection).toHaveTextContent(
      "Correct the selected layer's highlighted style fields before saving, previewing, or sending a test."
    );
    expect(visualStyleCorrection).not.toHaveTextContent("solid fill");

    await user.click(screen.getByRole("button", { name: "Shape" }));

    expect(screen.getByRole("heading", { name: "Shape" })).toBeVisible();
    expect(screen.queryByText("The shape layer was not added")).not.toBeInTheDocument();
  });

  it("adds and authors a solid-fill shape through the standard layer workflow", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    const view = render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("heading", { name: "New follower" });
    await user.click(screen.getByRole("button", { name: "Shape" }));

    expect(screen.getByRole("heading", { name: "Shape" })).toBeVisible();
    expect(screen.getByLabelText("Fill color")).toHaveValue("#000000");
    expect(screen.getByLabelText("Fill opacity")).toHaveValue("72");
    expect(view.container.querySelector(".alert-canvas__shape")).toHaveStyle({ background: "#000000B8" });

    fireEvent.change(screen.getByLabelText("Fill color"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("Fill opacity"), { target: { value: "50" } });
    const layerName = screen.getByRole("textbox", { name: "Layer name" });
    await user.clear(layerName);
    await user.type(layerName, "Background");
    await user.click(screen.getByRole("button", { name: "Hide Background" }));
    expect(view.container.querySelector(".alert-canvas__shape")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Background" }));

    await user.click(screen.getByText("Position and size", { selector: "summary" }));
    const geometry = screen.getByRole("group", { name: "Position and size" });
    fireEvent.change(within(geometry).getByLabelText("X"), { target: { value: "480" } });
    await user.click(screen.getByText("Animation preset", { selector: "summary" }));
    fireEvent.change(screen.getByLabelText("Animation duration (milliseconds)"), { target: { value: "650" } });
    await user.click(screen.getByRole("button", { name: "Move down" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByText("Background copy").closest("button")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("heading", { name: "Background" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Background", { selector: ".alert-editor-inspector__layer-list span" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Message" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.queryByRole("heading", { name: "Background" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({
        layers: expect.arrayContaining([
          expect.objectContaining({
            name: "Background",
            type: "shape",
            fill: "#12345680",
            visible: true,
            animation: expect.objectContaining({ durationMs: 650 })
          }),
          expect.objectContaining({ name: "Background copy", type: "shape", fill: "#12345680" })
        ]),
        targetProfiles: expect.arrayContaining([
          expect.objectContaining({
            id: "landscape",
            layerLayouts: expect.arrayContaining([
              expect.objectContaining({ x: 480, width: 700, height: 160 })
            ])
          }),
          expect.objectContaining({
            id: "vertical",
            layerLayouts: expect.arrayContaining([
              expect.objectContaining({ x: 190, y: 1180, width: 700, height: 160 })
            ])
          })
        ])
      }),
      false
    ));
  });

  it("blocks invalid shape fills with an inline correction", async () => {
    const user = userEvent.setup();
    const base = editorDocument();
    const document = {
      ...base,
      layers: [
        ...base.layers,
        {
          id: "layer-shape",
          name: "Unsafe shape",
          type: "shape",
          visible: true,
          order: 2,
          fill: "linear-gradient(red, blue)",
          animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
        }
      ],
      targetProfiles: base.targetProfiles.map((profile) => ({
        ...profile,
        layerLayouts: [...profile.layerLayouts, { layerId: "layer-shape", x: 100, y: 100, width: 400, height: 200, zIndex: 2 }]
      }))
    } as AlertEditorDocument;
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("heading", { name: "New follower" });
    await user.click(screen.getByText("Unsafe shape").closest("button")!);
    const name = screen.getByRole("textbox", { name: "Layer name" });
    await user.type(name, " draft");

    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent(
      "Visual styles need correction: Unsafe shape draft has an invalid solid fill."
    );
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("reports shape creation failures without retaining partial layouts", async () => {
    const user = userEvent.setup();
    const base = editorDocument();
    const document = { ...base, targetProfiles: base.targetProfiles.slice(0, 1) } as AlertEditorDocument;
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("heading", { name: "New follower" });
    await user.click(screen.getByRole("button", { name: "Shape" }));

    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("The shape layer was not added");
    expect(error).toHaveTextContent("Shape layer could not be created safely.");
    expect(error).toHaveTextContent("Reload the alert editor, then try adding Shape again.");
    expect(within(error).getByText(/^ui_/u)).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
  });

  it("loads a focused canvas workspace and keeps Preview separate from Send test", async () => {
    const user = userEvent.setup();
    const document = editorDocument();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    const sendAlertEditorTest = vi.fn(async (_alertId: string, request: { targetProfileId: "landscape" | "vertical" }) => ({
      status: "queued" as const,
      targetProfileId: request.targetProfileId,
      referenceId: "ref-editor-test",
      test: true as const
    }));
    const previewModeration = vi.fn(async (input: { readonly target: "rendered" | "tts"; readonly text: string }) => ({
      target: input.target,
      settings: { maxLength: 240, blockedTerms: [], stripUrls: false },
      text: "Moderated canvas text",
      actions: []
    }));
    const onOpenAlert = vi.fn();
    const onBack = vi.fn();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest,
            previewModeration
          }}
          onBack={onBack}
          onOpenAlert={onOpenAlert}
          targetProfileId="landscape"
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByRole("heading", { name: "New follower" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "AlertsEveryday alertsNew follower"
    );
    await user.click(screen.getByRole("button", { name: "Back to alerts" }));
    expect(onBack).toHaveBeenCalledWith("set-default");

    const layersTab = screen.getByRole("tab", { name: "Layers" });
    const alertTab = screen.getByRole("tab", { name: "Alert" });
    const eventTab = screen.getByRole("tab", { name: "Event" });
    layersTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(alertTab).toHaveAttribute("aria-selected", "true");
    expect(alertTab).toHaveAttribute("tabindex", "0");
    expect(alertTab).toHaveFocus();
    await user.keyboard("{End}");
    expect(eventTab).toHaveAttribute("aria-selected", "true");
    expect(eventTab).toHaveFocus();
    await user.keyboard("{Home}");
    expect(layersTab).toHaveAttribute("aria-selected", "true");
    expect(layersTab).toHaveAttribute("tabindex", "0");
    expect(alertTab).toHaveAttribute("tabindex", "-1");
    expect(layersTab).toHaveFocus();
    for (const inspectorTab of [layersTab, alertTab, eventTab]) {
      expect(globalThis.document.getElementById(inspectorTab.getAttribute("aria-controls")!)).not.toBeNull();
    }
    expect(layersTab).toHaveAttribute("aria-controls", "alert-editor-panel-layers");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "alert-editor-panel-layers");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "alert-editor-tab-layers");
    const canvas = within(screen.getByRole("region", { name: "Landscape alert canvas" }));
    expect(screen.getByRole("button", { name: /Landscape/ })).toHaveAttribute("aria-pressed", "true");

    const template = screen.getByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Welcome, James!");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saveWarning = screen.getByRole("dialog", { name: "Save changes to active alert?" });
    expect(saveWarning).toHaveTextContent("Follow events");
    expect(saveWarning).toHaveTextContent("Landscape");
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({ layers: expect.arrayContaining([expect.objectContaining({ template: "Welcome, James!" })]) }),
      true
    ));

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Local preview is running.")).toBeInTheDocument();
    expect(canvas.getByText("Moderated canvas text")).toBeInTheDocument();
    expect(canvas.queryByText("Welcome, James!")).not.toBeInTheDocument();
    expect(sendAlertEditorTest).not.toHaveBeenCalled();
    const firstPreviewLayer = screen.getByRole("button", { name: "Message layer" });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Message layer" })).not.toBe(firstPreviewLayer);
    await user.type(template, " again");
    expect(screen.queryByRole("button", { name: "Pause preview" })).not.toBeInTheDocument();
    expect(canvas.queryByText("Moderated canvas text")).not.toBeInTheDocument();
    expect(canvas.getByText("Welcome, James! again")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert" }));

    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(sendAlertEditorTest).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({ targetProfileId: "landscape", includeAudio: true, includeTts: true })
    ));
    expect((await screen.findByText(/Queued on Landscape.*ref-editor-test/)).closest(".management-toast")).toHaveClass("management-toast--success");

    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();

    await user.type(screen.getByRole("searchbox", { name: "Search alerts" }), "raid");
    await user.click(screen.getByRole("button", { name: /New raid/ }));
    expect(onOpenAlert).toHaveBeenCalledWith("alert-raid", "vertical");
  });

  it("groups editor navigation by event while preserving disclosure, search, and route identity", async () => {
    const user = userEvent.setup();
    const document = editorDocument();
    const source = alertSetDetail();
    const raid = source.inventory[1]!;
    const detail: AlertSetDetail = {
      ...source,
      inventory: [
        ...source.inventory,
        { ...raid, id: "variant-large-raid", parentAlertId: raid.id, name: "Large raid", kind: "variation" },
        { ...raid, id: "variant-orphan-raid", parentAlertId: "missing-raid", name: "Orphan raid", kind: "variation" },
        { ...source.inventory[0]!, id: "alert-future", eventType: "future_celebration", name: "Future celebration" }
      ]
    };
    const onOpenAlert = vi.fn();
    const getAlertSet = vi.fn(async () => detail);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet,
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={onOpenAlert}
        />
      </DirtyNavigationProvider>
    );

    const selectedEvent = await screen.findByRole("button", { name: "Follow alerts, selected event" });
    expect(selectedEvent).toHaveAttribute("aria-expanded", "true");
    expect(selectedEvent).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Collapse Raid/u })).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("button", { name: /Expand Resubscription/u })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Collapse future_celebration/u })).toBeInTheDocument();
    expect(screen.getByText("Variation of New raid")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Orphan variations" })).toBeVisible();

    await user.click(selectedEvent);
    expect(screen.getByRole("button", { name: "Follow alerts, selected event" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /New follower/u })).toHaveAttribute("aria-current", "page");
    expect(onOpenAlert).not.toHaveBeenCalled();

    await user.type(screen.getByRole("searchbox", { name: "Search alerts" }), "not-an-alert");
    expect(screen.getByText("No matching alerts.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox", { name: "Search alerts" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Follow alerts, selected event" })).toBeVisible();
    expect(getAlertSet).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Collapse Raid/u }));
    await user.type(screen.getByRole("searchbox", { name: "Search alerts" }), "large raid");
    expect(screen.getByRole("button", { name: /Collapse Raid/u })).toHaveAttribute("aria-expanded", "true");
    await user.clear(screen.getByRole("searchbox", { name: "Search alerts" }));
    expect(screen.getByRole("button", { name: /Expand Raid/u })).toHaveAttribute("aria-expanded", "false");

    await user.type(screen.getByRole("textbox", { name: "Message template" }), " unsaved");
    const emptyDisclosure = screen.getByRole("button", { name: /Expand Resubscription/u });
    emptyDisclosure.focus();
    await user.keyboard("{Enter}");
    expect(emptyDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog", { name: /unsaved changes/u })).not.toBeInTheDocument();
    expect(onOpenAlert).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Expand Raid/u }));
    await user.click(screen.getByRole("button", { name: /Large raid/u }));
    expect(onOpenAlert).toHaveBeenCalledWith("variant-large-raid", "landscape");
  });

  it("uses the loaded document set when set-detail loading fails", async () => {
    const onBack = vi.fn();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => { throw new Error("set detail unavailable"); }),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={onBack}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss error" })).not.toBeInTheDocument();
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByText("The alert editor could not be opened")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to alerts" }));
    expect(onBack).toHaveBeenCalledWith("set-default");
  });

  it("floats loaded-editor action errors, reports them, supports dismissal, and expires them after eight seconds", async () => {
    const user = userEvent.setup();
    const reportAlertEditorError = vi.fn(async (_alertId: string, input: { readonly error: { readonly referenceId: string | null } }) => ({
      referenceId: input.error.referenceId ?? "ui_editor_fallback"
    }));
    const managementApi = {
      getAlertEditorDocument: vi.fn(async () => editorDocument()),
      getAlertVariationAuthoringContext: vi.fn(async () => variationContext(editorDocument())),
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [] })),
      getAlertSet: vi.fn(async () => alertSetDetail(false)),
      listRegisteredProviders: vi.fn(async () => []),
      getAssetChangeImpact: vi.fn(),
      listAssetLibraryItems: vi.fn(async () => []),
      deleteAsset: vi.fn(),
      updateAssetMetadata: vi.fn(),
      saveAlertEditorDocument: vi.fn()
        .mockRejectedValueOnce(new Error("Database write failed."))
        .mockRejectedValue(new Error("Database write failed. (INTERNAL_SERVER_ERROR, err_editor_save)")),
      sendAlertEditorTest: vi.fn(),
      previewModeration: vi.fn(async (input) => ({
        target: input.target,
        settings: { maxLength: 240, blockedTerms: [], stripUrls: false },
        text: input.text,
        actions: []
      })),
      reportAlertEditorError
    } as AlertEditorPageApi & { readonly reportAlertEditorError: typeof reportAlertEditorError };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={managementApi}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Cannot save");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const firstError = await screen.findByRole("alert");
    expect(firstError.closest(".management-toast")).toHaveClass("management-toast--failure");
    expect(reportAlertEditorError).toHaveBeenCalledWith("alert-follow", expect.objectContaining({
      setId: "set-default",
      error: expect.objectContaining({ referenceId: expect.stringMatching(/^ui_/u) })
    }));
    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByText("The alert was not saved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("err_editor_save");
    expect(reportAlertEditorError).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("The alert was not saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.getByText("The alert was not saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("The alert was not saved")).not.toBeInTheDocument();
  });

  it("shows alert and set validation details with correction steps in the editor", async () => {
    const setDetail = alertSetDetail();
    setDetail.overview.validationIssues = [
      {
        id: "set-warning",
        severity: "warning",
        code: "SET_WARNING",
        message: "This set needs an enabled alert.",
        nextStep: "Enable a reviewed alert before activation.",
        targetProfileId: null,
        providerKind: null,
        eventType: null,
        alertId: null,
        referenceId: null
      },
      {
        id: "follow-blocker",
        severity: "blocker",
        code: "FOLLOW_BLOCKER",
        message: "New follower has no enabled variation.",
        nextStep: "Enable the default variation.",
        targetProfileId: "landscape",
        providerKind: "twitch",
        eventType: "follow",
        alertId: "alert-follow",
        referenceId: "ref-follow-validation"
      },
      {
        id: "raid-blocker",
        severity: "blocker",
        code: "RAID_BLOCKER",
        message: "New raid has no enabled variation.",
        nextStep: "Enable its default variation.",
        targetProfileId: null,
        providerKind: "twitch",
        eventType: "raid",
        alertId: "alert-raid",
        referenceId: null
      }
    ];

    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => setDetail),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const validation = await screen.findByRole("region", { name: "Validation issues" });
    expect(validation).toHaveTextContent("This set needs an enabled alert.");
    expect(validation).toHaveTextContent("Enable a reviewed alert before activation.");
    expect(validation).toHaveTextContent("New follower has no enabled variation.");
    expect(validation).toHaveTextContent("Enable the default variation.");
    expect(validation).toHaveTextContent("ref-follow-validation");
    expect(validation).not.toHaveTextContent("New raid has no enabled variation.");
  });

  it("guards route changes while the alert has unsaved edits", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/alerts/editor/alert-follow");
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
        <NavigationProbe />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Unsaved message");
    await user.click(screen.getByRole("button", { name: "Leave editor" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/manage/modules/alerts/editor/alert-follow");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/manage/modules/alerts");
  });

  it("requires active-alert confirmation before saving and leaving", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    window.history.replaceState(null, "", "/manage/modules/alerts/editor/alert-follow");
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
        <NavigationProbe />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Save before leaving");
    await user.click(screen.getByRole("button", { name: "Leave editor" }));
    await user.click(screen.getByRole("button", { name: "Save and leave" }));

    expect(screen.getByRole("dialog", { name: "Save changes to active alert?" })).toBeInTheDocument();
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/manage/modules/alerts/editor/alert-follow");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(window.location.pathname).toBe("/manage/modules/alerts");
  });

  it("saves disabled-profile-only layout changes without a live-impact warning", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("button", { name: /Vertical/ }));
    const xPosition = screen.getByLabelText("X");
    await user.clear(xPosition);
    await user.type(xPosition, "240");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog", { name: "Save changes to active alert?" })).not.toBeInTheDocument();
  });

  it("guards profile switches for ordinary unsaved edits", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Unsaved profile change");
    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    let dialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Unsaved profile change");
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    dialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard and switch" }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Thanks, {userName}!");
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Landscape/ }));
    await user.clear(screen.getByRole("textbox", { name: "Message template" }));
    await user.type(screen.getByRole("textbox", { name: "Message template" }), "Save before switching");
    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    dialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Save and switch" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Save before switching");
  });

  it("allows an applied starter theme to be reviewed in both profiles without persisting it", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    const dialog = screen.getByRole("dialog", { name: "Apply starter theme?" });
    await user.click(within(dialog).getByRole("radio", { name: "Neon Terminal" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply theme" }));

    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Layers" }));
    await user.click(screen.getByText("Message", { selector: ".alert-editor-inspector__layer-list span" }).closest("button")!);
    await user.clear(screen.getByRole("textbox", { name: "Message template" }));
    await user.type(screen.getByRole("textbox", { name: "Message template" }), "Edited themed draft");
    await user.click(screen.getByRole("button", { name: /^Landscape/u }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Edited themed draft");
    expect(screen.queryByRole("dialog", { name: "Switch profiles with unsaved changes?" })).not.toBeInTheDocument();
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
  });

  it("restores ordinary profile-switch guards after discarding an applied starter theme", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/alerts/editor/alert-follow");
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
        <NavigationProbe />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Apply starter theme" }));
    await user.click(within(screen.getByRole("dialog", { name: "Apply starter theme?" })).getByRole("button", { name: "Apply theme" }));
    await user.click(screen.getByRole("button", { name: "Leave editor" }));
    await user.click(within(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).getByRole("button", { name: "Discard" }));

    await user.click(screen.getByRole("tab", { name: "Layers" }));
    const template = screen.getByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Ordinary edit after discard");
    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    expect(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).toBeInTheDocument();
  });

  it("fits each canvas by default, remembers profile zoom, and confirms before replacing an edited target layout", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1_000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(700);
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("region", { name: "Landscape alert canvas" });
    await waitFor(() => expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("49%"));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("74%");
    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("33%"));

    const xPosition = screen.getByLabelText("X");
    await user.clear(xPosition);
    await user.type(xPosition, "240");
    await user.click(screen.getByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Copy layout from Landscape" }));
    const dialog = screen.getByRole("dialog", { name: "Replace edited Vertical layout?" });
    await user.click(within(dialog).getByRole("button", { name: "Replace layout" }));
    await user.click(screen.getByRole("tab", { name: "Layers" }));
    expect(screen.getByLabelText("X")).toHaveValue(343);

    await user.click(screen.getByRole("button", { name: /Landscape/ }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).getByRole("button", { name: "Discard and switch" }));
    expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("74%");
  });

  it("edits preset animation timing and easing", async () => {
    const user = userEvent.setup();
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("region", { name: "Landscape alert canvas" });
    await user.click(screen.getByText("Animation preset", { selector: "summary" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Animation duration (milliseconds)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Animation duration (milliseconds)" }), "650");
    await user.clear(screen.getByRole("spinbutton", { name: "Animation delay (milliseconds)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Animation delay (milliseconds)" }), "120");
    await user.selectOptions(screen.getByRole("combobox", { name: "Animation easing" }), "linear");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(saveAlertEditorDocument.mock.calls[0]![1].layers[0]?.animation).toMatchObject({
      durationMs: 650,
      delayMs: 120,
      easing: "linear"
    });
  });

  it("inserts event variables and keeps edited samples session-only with reset and validation", async () => {
    const user = userEvent.setup();
    const raidDocument: AlertEditorDocument = {
      ...editorDocument(),
      eventType: "raid",
      templateVariables: [
        { key: "userName", label: "User name", description: "Display name for the event actor." },
        { key: "raidViewers", label: "Raid viewers", description: "Number of viewers in the raid." }
      ],
      samplePayloads: [
        { id: "normal", label: "Normal raid", kind: "built-in", payload: { userName: "Raider", raidViewers: 25, amount: 25 } },
        { id: "edge", label: "Large raid", kind: "built-in", payload: { userName: "Long-Raider-Name", raidViewers: 5000, amount: 5000 } }
      ]
    };
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => raidDocument),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Welcome ");
    await user.click(screen.getByRole("button", { name: "Insert {userName}" }));
    expect(template).toHaveValue("Welcome {userName}");

    await user.click(screen.getByRole("tab", { name: "Event" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Sample payload" }), "edge");
    const payload = screen.getByRole("textbox", { name: "Session payload (JSON)" });
    expect((payload as HTMLTextAreaElement).value).toContain("Long-Raider-Name");
    await user.clear(payload);
    await user.click(payload);
    await user.paste('{"userName":"Edited","raidViewers":50,"amount":50}');
    await user.click(screen.getByRole("button", { name: "Reset sample" }));
    expect((payload as HTMLTextAreaElement).value).toContain("Long-Raider-Name");

    await user.clear(payload);
    await user.click(payload);
    await user.paste('{"userName":"Invalid","raidViewers":0,"amount":0}');
    expect(screen.getByRole("alert")).toHaveTextContent("Raid viewer count must be a positive number.");
    expect(screen.getAllByRole("button", { name: "Preview" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Send test" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
  });

  it("keeps local preview media opt-in and supports pause seek and replay", async () => {
    const user = userEvent.setup();
    const play = vi.fn(async () => undefined);
    const speak = vi.fn();
    vi.stubGlobal("Audio", class { volume = 1; play = play; });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(readonly text: string) {} });
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });
    const getAssetFile = vi.fn(async () => new Blob(["audio"], { type: "audio/mpeg" }));
    const previewDocument: AlertEditorDocument = {
      ...editorDocument(),
      templateVariables: [{ key: "userName", label: "User name", description: "Display name for the event actor." }],
      layers: [
        ...editorDocument().layers,
        { id: "layer-audio", name: "Sound", type: "audio", visible: true, order: 2, assetId: "asset-audio", volume: 0.5, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } },
        { id: "layer-tts", name: "Speech", type: "tts", visible: true, order: 3, enabled: true, providerId: "speakerbot", template: "Hello {actor.displayName}", animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }
      ]
    };
    const sendAlertEditorTest = vi.fn();
    const previewModeration = vi.fn(async (input: { readonly target: "rendered" | "tts"; readonly text: string }) => ({
      target: input.target,
      settings: { maxLength: 240, blockedTerms: [], stripUrls: false },
      text: input.target === "rendered" ? "Thanks, [blocked]!" : "Hello [blocked]",
      actions: []
    }));
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={{ ...assetApi, getAssetFile }}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => previewDocument),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => [activeSpeakerBot]),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest,
            previewModeration
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("region", { name: "Landscape alert canvas" });
    getAssetFile.mockClear();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(getAssetFile).not.toHaveBeenCalledWith("asset-audio");
    expect(speak).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause preview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause preview" }));
    expect(screen.getByText("Preview paused")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Event" }));
    expect(screen.getByRole("checkbox", { name: "Preview audio" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Preview TTS" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Send audio" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Send TTS" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Preview audio" }));
    await user.click(screen.getByRole("checkbox", { name: "Preview TTS" }));
    await user.click(screen.getAllByRole("button", { name: "Replay preview" }).at(-1)!);

    await waitFor(() => expect(getAssetFile).toHaveBeenCalledWith("asset-audio"));
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ text: "Hello [blocked]" });
    expect(previewModeration).toHaveBeenCalledWith({ target: "tts", text: "Hello James" });
    expect(sendAlertEditorTest).not.toHaveBeenCalled();
    const seek = screen.getByRole("slider", { name: "Preview position" });
    fireEvent.change(seek, { target: { value: "1200" } });
    expect(seek).toHaveValue("1200");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sample payload" }), "edge");
    expect(screen.queryByRole("button", { name: "Pause preview" })).not.toBeInTheDocument();
    expect(screen.queryByText("Thanks, [blocked]!")).not.toBeInTheDocument();
  });

  it("waits for every moderation response and fails closed before timing or media starts", async () => {
    const user = userEvent.setup();
    const play = vi.fn(async () => undefined);
    const speak = vi.fn();
    const getAssetFile = vi.fn(async () => new Blob(["audio"], { type: "audio/mpeg" }));
    vi.stubGlobal("Audio", class { volume = 1; play = play; });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(readonly text: string) {} });
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });
    let rejectTts: ((cause: unknown) => void) | undefined;
    const ttsResult = new Promise<never>((_resolve, reject) => { rejectTts = reject; });
    const previewModeration = vi.fn((input: { readonly target: "rendered" | "tts"; readonly text: string }) => {
      if (input.target === "tts") return ttsResult;
      return Promise.resolve({
        target: input.target,
        settings: { maxLength: 240, blockedTerms: [], stripUrls: false },
        text: "Welcome [blocked]",
        actions: []
      });
    });
    const previewDocument: AlertEditorDocument = {
      ...editorDocument(),
      layers: [
        ...editorDocument().layers,
        { id: "layer-audio", name: "Sound", type: "audio", visible: true, order: 2, assetId: "asset-audio", volume: 0.5, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } },
        { id: "layer-tts", name: "Speech", type: "tts", visible: true, order: 3, enabled: true, providerId: "speakerbot", template: "Speak {userName}", animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }
      ]
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={previewDocument.id}
          assetApi={{ ...assetApi, getAssetFile }}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => previewDocument),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => [activeSpeakerBot]),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, current) => current),
            sendAlertEditorTest: vi.fn(),
            previewModeration
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await screen.findByRole("region", { name: "Landscape alert canvas" });
    await user.click(screen.getByRole("tab", { name: "Event" }));
    await user.click(screen.getByRole("checkbox", { name: "Preview audio" }));
    await user.click(screen.getByRole("checkbox", { name: "Preview TTS" }));
    await user.click(screen.getAllByRole("button", { name: "Preview" })[0]!);

    await waitFor(() => expect(previewModeration).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Local preview is running.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause preview" })).not.toBeInTheDocument();
    expect(getAssetFile).not.toHaveBeenCalledWith("asset-audio");
    expect(play).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();

    await act(async () => rejectTts?.(new Error("raw-unmoderated-name ref_preview_failed")));

    expect(await screen.findByText("Local preview could not be prepared")).toBeInTheDocument();
    expect(screen.queryByText(/raw-unmoderated-name/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause preview" })).not.toBeInTheDocument();
    expect(getAssetFile).not.toHaveBeenCalledWith("asset-audio");
    expect(speak).not.toHaveBeenCalled();
  });

  it("shows the active TTS provider and persists its runtime provider id", async () => {
    const user = userEvent.setup();
    const ttsDocument: AlertEditorDocument = {
      ...editorDocument(),
      layers: [{
        id: "layer-tts",
        name: "Speech",
        type: "tts",
        visible: true,
        order: 0,
        enabled: true,
        providerId: "browser-speech",
        template: "Welcome {userName}",
        animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }
      }],
      targetProfiles: editorDocument().targetProfiles.map((profile) => ({ ...profile, layerLayouts: [] }))
    };
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);

    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={ttsDocument.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => ttsDocument),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => [activeSpeakerBot]),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const liveTtsSummary = await screen.findByText("Live TTS", { selector: "summary" });
    expect(liveTtsSummary.closest("details")).not.toHaveAttribute("open");
    const enabled = screen.getByRole("checkbox", { name: "Enable TTS for this alert" });
    expect(enabled).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(liveTtsSummary);
    expect(liveTtsSummary.closest("details")).toHaveAttribute("open");
    expect(enabled).toBeVisible();
    expect(screen.getByText("Studio Speaker.bot")).toBeVisible();
    expect(screen.getByText("Speaker.bot is used for live TTS.")).toBeVisible();
    expect(enabled).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(enabled);
    expect(enabled).not.toBeChecked();
    await user.click(enabled);
    expect(enabled).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "TTS template" }), { target: { value: "Hello {userName}" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      ttsDocument.id,
      expect.objectContaining({
        layers: [expect.objectContaining({
          type: "tts",
          enabled: true,
          providerId: "speakerbot",
          template: "Hello {userName}"
        })]
      }),
      false
    ));
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  it("requires an active provider before a new TTS layer can be enabled", async () => {
    const user = userEvent.setup();
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("button", { name: "TTS" }));
    expect(screen.queryByRole("button", { name: "Hide Text to speech" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Enable TTS for this alert" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Enable TTS for this alert" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Set up a TTS provider" })).toHaveAttribute("href", "/manage/tts-providers");
    expect(screen.getByText("An active TTS provider is required before this layer can be used live.")).toBeInTheDocument();
  });

  it("keeps editor actions unavailable until active-set status is known", async () => {
    let resolveSet: ((value: AlertSetDetail) => void) | undefined;
    const setDetail = new Promise<AlertSetDetail>((resolve) => {
      resolveSet = resolve;
    });

    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => setDetail),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Loading alert editor");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    await act(async () => {
      resolveSet?.(alertSetDetail());
      await setDetail;
    });
    expect(await screen.findByRole("heading", { name: "New follower" })).toBeInTheDocument();
  });

  it("rechecks set activation immediately before deciding whether save needs confirmation", async () => {
    const user = userEvent.setup();
    const inactiveSet = alertSetDetail(false);
    const getAlertSet = vi
      .fn<() => Promise<AlertSetDetail>>()
      .mockResolvedValueOnce(inactiveSet)
      .mockResolvedValueOnce(alertSetDetail(true));
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet,
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Set became active");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("dialog", { name: "Save changes to active alert?" })).toBeInTheDocument();
    expect(getAlertSet).toHaveBeenCalledTimes(2);
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
  });

  it("preserves edits made while an earlier save request is pending", async () => {
    const user = userEvent.setup();
    let resolveSave: ((document: AlertEditorDocument) => void) | undefined;
    const saveResult = new Promise<AlertEditorDocument>((resolve) => { resolveSave = resolve; });
    let submitted: AlertEditorDocument | null = null;
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => {
      submitted = document;
      return saveResult;
    });
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Submitted edit");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    await user.clear(template);
    await user.type(template, "Newer local edit");

    await act(async () => {
      resolveSave?.(submitted!);
      await saveResult;
    });
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Newer local edit");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("keeps navigation blocked and shows the save failure after active-alert confirmation", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/alerts/editor/alert-follow");
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => editorDocument()),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async () => {
              throw new Error("Database write failed. Reference ref-save-17.");
            }),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
        <NavigationProbe />
      </DirtyNavigationProvider>
    );

    const template = await screen.findByRole("textbox", { name: "Message template" });
    await user.clear(template);
    await user.type(template, "Cannot save");
    await user.click(screen.getByRole("button", { name: "Leave editor" }));
    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("dialog", { name: "Leave with unsaved changes?" }))
      .toHaveTextContent("Database write failed. Reference ref-save-17.");
    expect(window.location.pathname).toBe("/manage/modules/alerts/editor/alert-follow");
  });

  it("preserves an untouched legacy reward equality when the catalog fails and another edit is saved", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [
        { field: "channelPointReward", operator: "equals", value: "reward-hydrate" },
        { field: "rewardTitle", operator: "includes", value: "Hydrate" }
      ]
    });
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => { throw new Error("Twitch unavailable"); }),
      saveAlertEditorDocument
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    expect(await screen.findByText("Twitch rewards could not be loaded")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Custom Twitch rewards" })).toHaveLength(1);
    const ruleConditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(within(ruleConditions).queryByRole("textbox", { name: "Rule conditions Reward ID value" })).not.toBeInTheDocument();

    const cooldown = screen.getByRole("spinbutton", { name: "Cooldown (seconds)" });
    await user.clear(cooldown);
    await user.type(cooldown, "7");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(1));
    expect(saveAlertEditorDocument.mock.calls[0]![1].conditions).toEqual(document.conditions);
  });

  it("normalizes an explicit second reward to one ordered membership condition", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [
        { field: "channelPointReward", operator: "equals", value: "reward-hydrate" },
        { field: "rewardTitle", operator: "includes", value: "reward" }
      ]
    });
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [
        customReward("reward-hydrate", "Hydrate"),
        customReward("reward-stretch", "Stretch")
      ] })),
      saveAlertEditorDocument
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    await user.click(await screen.findByRole("checkbox", { name: /Stretch/u }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(1));
    const savedRewardConditions = saveAlertEditorDocument.mock.calls[0]![1].conditions
      .filter((condition) => condition.field === "channelPointReward");
    expect(savedRewardConditions).toEqual([
      { field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-stretch"] }
    ]);
    expect(saveAlertEditorDocument.mock.calls[0]![1].conditions).toContainEqual(
      { field: "rewardTitle", operator: "includes", value: "reward" }
    );
  });

  it("removes every reward condition only when catch-all coverage is explicitly selected", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [
        { field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-stretch"] },
        { field: "rewardTitle", operator: "includes", value: "reward" }
      ]
    });
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [customReward("reward-hydrate", "Hydrate")] })),
      saveAlertEditorDocument
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    await user.click(screen.getByRole("radio", { name: "Every custom reward, including future rewards" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(1));
    expect(saveAlertEditorDocument.mock.calls[0]![1].conditions).toEqual([
      { field: "rewardTitle", operator: "includes", value: "reward" }
    ]);
  });

  it("reconciles current reward metadata while preserving deleted IDs through save, reload, and account switch", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-deleted"] }]
    });
    const loadRewards = vi.fn<AlertEditorPageApi["getTwitchCustomRewards"]>()
      .mockResolvedValueOnce({ rewards: [customReward("reward-hydrate", "Old title")] })
      .mockResolvedValueOnce({ rewards: [customReward("reward-hydrate", "Current title", { isPaused: true })] });
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    const firstView = renderChannelPointEditor(document, { getTwitchCustomRewards: loadRewards, saveAlertEditorDocument });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    expect(await screen.findByText("Old title")).toBeInTheDocument();
    expect(screen.getByText("reward-deleted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh rewards" }));
    expect(await screen.findByText("Current title")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();

    const priority = screen.getByRole("spinbutton", { name: "Rule priority" });
    await user.clear(priority);
    await user.type(priority, "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(1));
    const saved = saveAlertEditorDocument.mock.calls[0]![1];
    expect(saved.conditions).toContainEqual({
      field: "channelPointReward",
      operator: "oneOf",
      value: ["reward-hydrate", "reward-deleted"]
    });

    firstView.unmount();
    renderChannelPointEditor(saved, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [customReward("other-account-reward", "Other account reward")] }))
    });
    await user.click(await screen.findByRole("tab", { name: "Event" }));
    await screen.findByText("Other account reward");
    expect(screen.getByText("reward-hydrate")).toBeInTheDocument();
    expect(screen.getByText("reward-deleted")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable reward")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: /Unavailable reward.*reward-hydrate/u })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Unavailable reward.*reward-deleted/u })).toBeChecked();
  });

  it("warns only for another active intersecting or catch-all redemption rule", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }]
    });
    const baseRow = channelPointInventoryRow(document);
    const setDetail = channelPointAlertSetDetail(document, [
      { ...baseRow, id: "alert-intersection", name: "Hydration layer", conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-stretch"] }] },
      { ...baseRow, id: "alert-catch-all", name: "Every reward celebration", conditions: [] },
      { ...baseRow, id: "alert-disabled", name: "Disabled overlap", enabled: false, conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }] },
      { ...baseRow, id: "alert-disjoint", name: "Disjoint reward", conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-dance"] }] }
    ]);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [
        customReward("reward-hydrate", "Hydrate"),
        customReward("reward-stretch", "Stretch")
      ] })),
      setDetail
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const warning = await screen.findByRole("note", { name: "Potential overlapping alerts" });
    expect(warning).toHaveTextContent("Hydration layer");
    expect(warning).toHaveTextContent("Every reward celebration");
    expect(warning).not.toHaveTextContent("Disabled overlap");
    expect(warning).not.toHaveTextContent("Disjoint reward");
    expect(warning).not.toHaveTextContent(document.name);
    await user.click(await screen.findByRole("checkbox", { name: /Stretch/u }));
    expect(screen.getByRole("note", { name: "Potential overlapping alerts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("uses current rewards for session samples and defaults outside samples without persisting catalog data", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-stretch"] }],
      samplePayloads: [{
        id: "normal",
        label: "Outside reward",
        kind: "built-in",
        payload: { userName: "James", rewardId: "reward-outside", rewardTitle: "Outside reward", userInput: "" }
      }]
    });
    const originalSamples = structuredClone(document.samplePayloads);
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [
        customReward("reward-hydrate", "Hydrate now"),
        customReward("reward-stretch", "Stretch now")
      ] })),
      saveAlertEditorDocument
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const sampleDraft = screen.getByRole("textbox", { name: "Session payload (JSON)" });
    await waitFor(() => expect(JSON.parse((sampleDraft as HTMLTextAreaElement).value)).toMatchObject({
      rewardId: "reward-hydrate",
      rewardTitle: "Hydrate now"
    }));
    await user.click(screen.getByRole("button", { name: "Use Stretch now as sample" }));
    expect(JSON.parse((sampleDraft as HTMLTextAreaElement).value)).toMatchObject({
      userName: "James",
      rewardId: "reward-stretch",
      rewardTitle: "Stretch now",
      userInput: ""
    });

    const cooldown = screen.getByRole("spinbutton", { name: "Cooldown (seconds)" });
    await user.clear(cooldown);
    await user.type(cooldown, "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(1));
    expect(document.samplePayloads).toEqual(originalSamples);
    expect(saveAlertEditorDocument.mock.calls[0]![1].samplePayloads).toEqual(originalSamples);
  });

  it("repairs a malformed session draft with a reward sample without mutating built-in samples", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }]
    });
    const originalSamples = structuredClone(document.samplePayloads);
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [customReward("reward-hydrate", "Hydrate now")] }))
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    await screen.findByText("1 custom reward loaded.");
    const sampleDraft = screen.getByRole("textbox", { name: "Session payload (JSON)" });
    fireEvent.change(sampleDraft, { target: { value: "{ malformed" } });
    expect(await screen.findByText("Sample payload must be a valid JSON object.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Hydrate now as sample" }));

    await waitFor(() => expect(JSON.parse((sampleDraft as HTMLTextAreaElement).value)).toEqual({
      rewardId: "reward-hydrate",
      rewardTitle: "Hydrate now"
    }));
    expect(screen.queryByText("Sample payload must be a valid JSON object.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(document.samplePayloads).toEqual(originalSamples);
  });

  it("explains inside and outside reward samples without disabling preview or send test", async () => {
    const user = userEvent.setup();
    const document = channelPointDocument({
      conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }]
    });
    renderChannelPointEditor(document, {
      getTwitchCustomRewards: vi.fn(async () => ({ rewards: [customReward("reward-hydrate", "Hydrate")] }))
    });

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    await screen.findByText("1 custom reward loaded.");
    expect(screen.getByRole("group", { name: "Rule conditions" })).toHaveTextContent(
      "No additional conditions. Reward coverage above determines which channel point redemption events are eligible."
    );
    const explanation = screen.getByRole("region", { name: "Sample selection explanation" });
    expect(explanation).toHaveTextContent("Default plays as the fallback for this sample.");
    const sampleDraft = screen.getByRole("textbox", { name: "Session payload (JSON)" });
    fireEvent.change(sampleDraft, {
      target: { value: JSON.stringify({ userName: "James", rewardId: "reward-outside", rewardTitle: "Outside reward" }) }
    });
    await waitFor(() => expect(explanation).toHaveTextContent("No alert plays for this sample."));
    expect(JSON.parse((sampleDraft as HTMLTextAreaElement).value)).toMatchObject({
      rewardId: "reward-outside",
      rewardTitle: "Outside reward"
    });
    expect(explanation).toHaveTextContent("Reward ID is one of reward-hydrate");
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Replay preview" })).toBeEnabled();
    for (const button of screen.getAllByRole("button", { name: "Send test" })) expect(button).toBeEnabled();
  });

  it("shows saved variation membership as Legacy while retaining exact reward ID authoring", async () => {
    const user = userEvent.setup();
    const variation = channelPointDocument({
      id: "variation-rewards",
      kind: "variation",
      parentAlertId: "alert-channel-points",
      name: "Special reward variation",
      conditions: [],
      variantConditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate", "reward-stretch"] }]
    });
    renderChannelPointEditor(variation);

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    expect(screen.queryByRole("heading", { name: "Custom Twitch rewards" })).not.toBeInTheDocument();
    const variationConditions = screen.getByRole("group", { name: "Variation conditions" });
    expect(variationConditions).toHaveTextContent("Legacy condition");
    expect(variationConditions).toHaveTextContent("Reward ID is one of reward-hydrate, reward-stretch");
    await user.click(within(variationConditions).getByRole("button", { name: "Remove channelPointReward from Variation conditions" }));
    await user.click(within(variationConditions).getByRole("button", { name: "Add condition" }));
    const operator = within(variationConditions).getByRole("combobox", { name: "Variation conditions Reward ID operator" });
    expect(within(operator).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["equals"]);
    expect(within(variationConditions).getByRole("textbox", { name: "Variation conditions Reward ID value" })).toBeInTheDocument();
  });

  it("edits variation conditions and shared rule controls", async () => {
    const user = userEvent.setup();
    const variation: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-large-raid",
      eventType: "raid",
      kind: "variation",
      parentAlertId: "alert-raid",
      name: "Large raid",
      weight: 2,
      priority: 5,
      samplePayloads: [{
        id: "normal",
        label: "Normal example",
        kind: "built-in",
        payload: { userName: "Raider", raidViewers: 50, amount: 50 }
      }]
    };
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={variation.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => variation),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const sharedControls = screen.getByRole("group", { name: "Affects default and all variations" });
    expect(within(sharedControls).getByRole("group", { name: "Rule conditions" })).toBeInTheDocument();
    expect(within(sharedControls).getByRole("spinbutton", { name: "Cooldown (seconds)" })).toBeInTheDocument();
    expect(within(sharedControls).getByRole("spinbutton", { name: "Rule priority" })).toBeInTheDocument();
    const variationControls = screen.getByRole("group", { name: "Affects this variation only" });
    const variationConditions = within(variationControls).getByRole("group", { name: "Variation conditions" });
    await user.click(within(variationConditions).getByRole("button", { name: "Add condition" }));
    expect(within(variationConditions).getByRole("combobox", { name: "Variation conditions condition 1 field" })).toHaveFocus();
    const viewerMinimum = within(variationConditions).getByRole("spinbutton", { name: "Variation conditions Raid viewers value" });
    await user.selectOptions(
      within(variationConditions).getByRole("combobox", { name: "Variation conditions Raid viewers operator" }),
      "min"
    );
    await user.clear(viewerMinimum);
    await user.type(viewerMinimum, "25");
    await user.click(within(variationConditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(
      within(variationConditions).getByRole("combobox", { name: "Variation conditions condition 2 field" }),
      "ingestProvider"
    );
    await user.selectOptions(
      within(variationConditions).getByRole("combobox", { name: "Variation conditions Event source value" }),
      "streamerbot"
    );
    await user.clear(within(variationControls).getByRole("spinbutton", { name: "Relative chance" }));
    await user.type(within(variationControls).getByRole("spinbutton", { name: "Relative chance" }), "4");
    expect(within(variationControls).queryByRole("spinbutton", { name: "Variation priority" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: "Cooldown (seconds)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Cooldown (seconds)" }), "15");
    await user.clear(screen.getByRole("spinbutton", { name: "Rule priority" }));
    await user.type(screen.getByRole("spinbutton", { name: "Rule priority" }), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      variation.id,
      expect.objectContaining({
        weight: 4,
        priority: 5,
        cooldownSeconds: 15,
        rulePriority: 3,
        variantConditions: [
          { field: "raidViewers", operator: "min", value: 25 },
          { field: "ingestProvider", operator: "equals", value: "streamerbot" }
        ]
      }),
      false
    ));
  });

  it.each<{
    readonly eventType: AlertEditorDocument["eventType"];
    readonly expected: readonly string[];
    readonly absent?: string;
  }>([
    { eventType: "gift_subscription", expected: ["Subscription tier"] },
    { eventType: "community_gift", expected: ["Subscription tier", "Gift count", "Anonymous gift"] },
    { eventType: "hype_train_progress", expected: ["Hype Train level", "Hype Train progress", "Hype Train total"] },
    { eventType: "poll_end", expected: ["Poll votes", "Terminal status"] },
    { eventType: "prediction_end", expected: ["Prediction points", "Total users", "Terminal status"] },
    { eventType: "stream_online", expected: ["Stream type"] },
    { eventType: "stream_offline", expected: ["Event source"], absent: "Stream type" }
  ])("offers only applicable normalized conditions for expanded event family $eventType", async ({ eventType, expected, absent }) => {
    const user = userEvent.setup();
    const document = { ...editorDocument(), id: `alert-${eventType}`, eventType };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, saved) => saved),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    const field = within(conditions).getByRole("combobox", { name: "Rule conditions condition 1 field" });
    for (const label of expected) expect(within(field).getByRole("option", { name: label })).toBeInTheDocument();
    if (absent !== undefined) expect(within(field).queryByRole("option", { name: absent })).not.toBeInTheDocument();
    expect(within(field).queryByRole("option", { name: /metadata|actor|provider id/iu })).not.toBeInTheDocument();
  });

  it("allows terminated as a poll-end terminal status", async () => {
    const user = userEvent.setup();
    const document = { ...editorDocument(), id: "alert-poll-end", eventType: "poll_end" as const };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, saved) => saved),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(within(conditions).getByRole("combobox", { name: "Rule conditions condition 1 field" }), "terminalStatus");
    const status = within(conditions).getByRole("combobox", { name: "Rule conditions Terminal status value" });
    await user.selectOptions(status, "terminated");

    expect(status).toHaveValue("terminated");
    expect(within(status).getByRole("option", { name: "Terminated" })).toHaveValue("terminated");
  });

  it("blocks saving an invalid minimum condition and explains the correction", async () => {
    const user = userEvent.setup();
    const variation: AlertEditorDocument = {
      ...editorDocument(),
      id: "variant-invalid-raid",
      eventType: "raid",
      kind: "variation",
      parentAlertId: "alert-raid",
      name: "Invalid raid variation"
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={variation.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => variation),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Variation conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(within(conditions).getByRole("combobox", { name: "Variation conditions Raid viewers operator" }), "min");
    const input = within(conditions).getByRole("spinbutton", { name: "Variation conditions Raid viewers value" });
    await user.clear(input);
    await user.type(input, "0");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewers must be at least 1.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("preserves and displays an existing condition outside the authoring catalog", async () => {
    const user = userEvent.setup();
    const document: AlertEditorDocument = {
      ...editorDocument(),
      conditions: [
        { field: "providerId", operator: "equals", value: "twitch" },
        { field: "ingestProvider", operator: "equals", value: "twitch" }
      ]
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={document.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, saved) => saved),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(conditions).toHaveTextContent("Legacy condition");
    expect(conditions).toHaveTextContent("providerId equals twitch");
    expect(within(conditions).queryByRole("spinbutton", { name: /providerId/u })).not.toBeInTheDocument();
    expect(within(conditions).queryByRole("textbox", { name: /field|path|json/iu })).not.toBeInTheDocument();
    await user.click(within(conditions).getByRole("button", { name: "Remove providerId from Rule conditions" }));
    expect(within(conditions).getByRole("combobox", { name: "Rule conditions condition 1 field" })).toHaveFocus();
    await user.click(within(conditions).getByRole("button", { name: "Remove Event source from Rule conditions" }));
    expect(within(conditions).getByRole("button", { name: "Add condition" })).toHaveFocus();
  });

  it("renders every typed condition value kind and approved operator with readable summaries", async () => {
    const user = userEvent.setup();
    const document = { ...editorDocument(), id: "alert-community-gift", eventType: "community_gift" as const };
    const view = render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={document.id} assetApi={assetApi} managementApi={{
          getAlertEditorDocument: vi.fn(async () => document), getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []), getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(), saveAlertEditorDocument: vi.fn(async (_id, saved) => saved), sendAlertEditorTest: vi.fn()
        }} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    expect(within(conditions).getByRole("combobox", { name: "Rule conditions Subscription tier value" })).toBeInTheDocument();
    expect(conditions).toHaveTextContent("Subscription tier is Prime");
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(within(conditions).getByRole("combobox", { name: "Rule conditions condition 2 field" }), "anonymous");
    await user.click(within(conditions).getByRole("checkbox", { name: "Rule conditions Anonymous gift value" }));
    expect(conditions).toHaveTextContent("Anonymous gift is true");
    view.unmount();

    const redemption = { ...editorDocument(), id: "alert-redemption", eventType: "channel_point_redemption" as const };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={redemption.id} assetApi={assetApi} managementApi={{
          getAlertEditorDocument: vi.fn(async () => redemption), getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []), getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(), saveAlertEditorDocument: vi.fn(async (_id, saved) => saved), sendAlertEditorTest: vi.fn()
        }} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );
    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const textConditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.click(within(textConditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(within(textConditions).getByRole("combobox", { name: "Rule conditions condition 1 field" }), "rewardTitle");
    const textOperator = within(textConditions).getByRole("combobox", { name: "Rule conditions Reward title operator" });
    expect(within(textOperator).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["equals", "includes"]);
    await user.selectOptions(textOperator, "includes");
    const textValue = within(textConditions).getByRole("textbox", { name: "Rule conditions Reward title value" });
    await user.clear(textValue);
    await user.type(textValue, "Hydrate");
    expect(textConditions).toHaveTextContent("Reward title contains Hydrate");
  });

  it("resets operator values and retains invalid range drafts while blocking editor actions", async () => {
    const user = userEvent.setup();
    const variation: AlertEditorDocument = {
      ...editorDocument(), id: "variant-range-raid", eventType: "raid", kind: "variation", parentAlertId: "alert-raid",
      conditions: [{ field: "raidViewers", operator: "range", value: [10, 20] }],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "Raider", raidViewers: 50, amount: 50 } }]
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={variation.id} assetApi={assetApi} managementApi={{
          getAlertEditorDocument: vi.fn(async () => variation), getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []), getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(), saveAlertEditorDocument: vi.fn(async (_id, saved) => saved), sendAlertEditorTest: vi.fn()
        }} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    const operator = within(conditions).getByRole("combobox", { name: "Rule conditions Raid viewers operator" });
    expect(within(operator).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["equals", "min", "max", "range"]);
    const minimum = within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Minimum" });
    const maximum = within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" });
    await user.clear(maximum);
    expect(maximum).toHaveValue(null);
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewers requires a finite numeric value.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Preview" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getAllByRole("button", { name: "Send test" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    await user.type(maximum, "5");
    expect(minimum).toHaveValue(10);
    expect(maximum).toHaveValue(5);
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewers range minimum cannot exceed its maximum.");
    await user.clear(maximum);
    await user.type(maximum, "25");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(conditions).toHaveTextContent("Raid viewers is between 10 and 25");
    await user.selectOptions(operator, "min");
    expect(within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers value" })).toHaveValue(1);
    expect(conditions).toHaveTextContent("Raid viewers is at least 1");
  });

  it("discards invalid range drafts when toolbar history restores configuration snapshots", async () => {
    const user = userEvent.setup();
    const document: AlertEditorDocument = {
      ...editorDocument(),
      id: "alert-range-history",
      eventType: "raid",
      conditions: [],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "Raider", raidViewers: 50, amount: 50 } }]
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={document.id} assetApi={assetApi} managementApi={{
          getAlertEditorDocument: vi.fn(async () => document), getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []), getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(), saveAlertEditorDocument: vi.fn(async (_id, saved) => saved), sendAlertEditorTest: vi.fn()
        }} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    let conditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.click(within(conditions).getByRole("button", { name: "Add condition" }));
    await user.selectOptions(
      within(conditions).getByRole("combobox", { name: "Rule conditions Raid viewers operator" }),
      "range"
    );
    await user.clear(within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" }));
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewers requires a finite numeric value.");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    conditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(within(conditions).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers value" })).toHaveValue(1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    conditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(conditions).toHaveTextContent("No conditions.");
    expect(screen.getByRole("button", { name: "Revert" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Preview$/u })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Redo" }));
    conditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(within(conditions).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers value" })).toHaveValue(1);
  });

  it("discards invalid range drafts and restores saved values on Revert", async () => {
    const user = userEvent.setup();
    const document: AlertEditorDocument = {
      ...editorDocument(),
      id: "alert-range-revert",
      eventType: "raid",
      conditions: [{ field: "raidViewers", operator: "range", value: [10, 20] }],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "Raider", raidViewers: 50, amount: 50 } }]
    };
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={document.id} assetApi={assetApi} managementApi={{
          getAlertEditorDocument: vi.fn(async () => document), getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []), getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(), saveAlertEditorDocument: vi.fn(async (_id, saved) => saved), sendAlertEditorTest: vi.fn()
        }} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const conditions = screen.getByRole("group", { name: "Rule conditions" });
    const maximum = within(conditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" });
    await user.clear(maximum);
    await user.type(maximum, "25");
    await user.clear(maximum);
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewers requires a finite numeric value.");
    expect(screen.getByRole("button", { name: "Revert" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Revert" }));

    const restoredConditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(within(restoredConditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Minimum" })).toHaveValue(10);
    expect(within(restoredConditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" })).toHaveValue(20);
    expect(within(restoredConditions).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Preview" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getAllByRole("button", { name: "Send test" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("does not carry invalid range drafts to a newly loaded alert document", async () => {
    const user = userEvent.setup();
    const first: AlertEditorDocument = {
      ...editorDocument(),
      id: "alert-range-first",
      eventType: "raid",
      name: "First raid",
      conditions: [{ field: "raidViewers", operator: "range", value: [10, 20] }],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "First", raidViewers: 50, amount: 50 } }]
    };
    const second: AlertEditorDocument = {
      ...first,
      id: "alert-range-second",
      name: "Second raid",
      conditions: [{ field: "raidViewers", operator: "range", value: [30, 40] }],
      samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { userName: "Second", raidViewers: 60, amount: 60 } }]
    };
    const getAlertEditorDocument = vi.fn(async (alertId: string) => alertId === first.id ? first : second);
    const managementApi = {
      getAlertEditorDocument, getAlertSet: vi.fn(async () => alertSetDetail(false)), listRegisteredProviders: vi.fn(async () => []),
      getAssetChangeImpact: vi.fn(), listAssetLibraryItems: vi.fn(async () => []), deleteAsset: vi.fn(), updateAssetMetadata: vi.fn(),
      saveAlertEditorDocument: vi.fn(async (_id: string, saved: AlertEditorDocument) => saved), sendAlertEditorTest: vi.fn()
    };
    const view = render(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={first.id} assetApi={assetApi} managementApi={managementApi} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );
    await user.click(await screen.findByRole("tab", { name: "Event" }));
    const firstConditions = screen.getByRole("group", { name: "Rule conditions" });
    await user.clear(within(firstConditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" }));
    expect(within(firstConditions).getByRole("alert")).toBeInTheDocument();

    view.rerender(
      <DirtyNavigationProvider>
        <AlertEditorPage alertId={second.id} assetApi={assetApi} managementApi={managementApi} onBack={() => undefined} onOpenAlert={() => undefined} />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByRole("heading", { name: "Second raid" })).toBeInTheDocument();
    const secondConditions = screen.getByRole("group", { name: "Rule conditions" });
    expect(within(secondConditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Minimum" })).toHaveValue(30);
    expect(within(secondConditions).getByRole("spinbutton", { name: "Rule conditions Raid viewers Maximum" })).toHaveValue(40);
    expect(within(secondConditions).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Preview" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("copies only design fields from another alert", async () => {
    const user = userEvent.setup();
    const target: AlertEditorDocument = {
      ...editorDocument(),
      conditions: [{ field: "ingestProvider", operator: "equals", value: "streamerbot" }]
    };
    const source: AlertEditorDocument = {
      ...editorDocument(),
      id: "alert-raid",
      eventType: "raid",
      name: "New raid",
      enabled: false,
      layers: [{
        id: "layer-source",
        name: "Raid message",
        type: "text",
        visible: true,
        order: 0,
        template: "Raid from {userName}!",
        textStyle: structuredClone(compatibilityAlertTextStyle),
        boxStyle: structuredClone(compatibilityAlertTextBoxStyle),
        animation: { mode: "preset", entrance: "scale", exit: "fade", durationMs: 500, delayMs: 25, easing: "ease-out" }
      }],
      targetProfiles: target.targetProfiles.map((profile) => ({
        ...profile,
        enabled: false,
        reviewState: "needs-review",
        layerLayouts: [{ layerId: "layer-source", x: 100, y: 200, width: 300, height: 120, zIndex: 0 }]
      })),
      samplePayloads: [{ id: "source", label: "Source sample", kind: "built-in", payload: { userName: "Source" } }]
    };
    const getAlertEditorDocument = vi.fn(async (alertId: string) => alertId === source.id ? source : target);
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={target.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument,
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Copy design from..." }));
    const dialog = screen.getByRole("dialog", { name: "Copy design from another alert?" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Source alert" }), source.id);
    await user.click(within(dialog).getByRole("button", { name: "Copy design" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    const saved = saveAlertEditorDocument.mock.calls[0]![1];
    expect(saved).toMatchObject({
      id: target.id,
      eventType: target.eventType,
      name: target.name,
      enabled: target.enabled,
      conditions: target.conditions,
      samplePayloads: target.samplePayloads,
      layers: source.layers
    });
    expect(saved.targetProfiles.map(({ enabled, reviewState, layerLayouts }) => ({ enabled, reviewState, layerLayouts }))).toEqual([
      { enabled: true, reviewState: "ready", layerLayouts: source.targetProfiles[0]!.layerLayouts },
      { enabled: false, reviewState: "needs-review", layerLayouts: source.targetProfiles[1]!.layerLayouts }
    ]);
  });

  it("preserves edits made while a copied design is loading", async () => {
    const user = userEvent.setup();
    const target = editorDocument();
    const source: AlertEditorDocument = {
      ...structuredClone(target),
      id: "alert-raid",
      eventType: "raid",
      name: "Raid design",
      layers: target.layers.map((layer, index) => index === 0 ? { ...layer, name: "Copied message" } : layer)
    };
    let resolveSource!: (document: AlertEditorDocument) => void;
    const sourceRequest = new Promise<AlertEditorDocument>((resolve) => { resolveSource = resolve; });
    const getAlertEditorDocument = vi.fn((alertId: string) => alertId === source.id
      ? sourceRequest
      : Promise.resolve(target));

    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={target.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument,
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    await user.click(await screen.findByRole("tab", { name: "Alert" }));
    await user.click(screen.getByRole("button", { name: "Copy design from..." }));
    const dialog = screen.getByRole("dialog", { name: "Copy design from another alert?" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Source alert" }), source.id);
    await user.click(within(dialog).getByRole("button", { name: "Copy design" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Copy design from another alert?" })).not.toBeInTheDocument();

    const name = screen.getByRole("textbox", { name: "Alert name" });
    fireEvent.change(name, { target: { value: "Edited while copying" } });
    expect(name).toHaveValue("Edited while copying");

    await act(async () => { resolveSource(source); });
    expect(await screen.findByText("Design copied.")).toBeInTheDocument();
    expect(name).toHaveValue("Edited while copying");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(name).toHaveValue("Edited while copying");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(name).toHaveValue(target.name);
  });

  it("reviews and saves two already-enabled profiles incrementally", async () => {
    const user = userEvent.setup();
    const base = editorDocument();
    const initial: AlertEditorDocument = {
      ...base,
      targetProfiles: base.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "needs-review"
      }))
    };
    const saveAlertEditorDocument = vi.fn(async (_alertId: string, document: AlertEditorDocument) => document);
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId={initial.id}
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => initial),
            getAlertSet: vi.fn(async () => alertSetDetail(false)),
            listRegisteredProviders: vi.fn(async () => []),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest: vi.fn()
          }}
          onBack={() => undefined}
          onOpenAlert={() => undefined}
        />
      </DirtyNavigationProvider>
    );

    const landscapeReviewWarning = (await screen.findByText(/This generated layout is editable/u)).closest(".alert-editor-page__profile-warning");
    expect(landscapeReviewWarning).not.toBeNull();
    await user.click(within(landscapeReviewWarning as HTMLElement).getByRole("button", { name: "Mark reviewed" }));
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.queryByText(/This generated layout is editable/u)).not.toBeInTheDocument();
    expect(saveAlertEditorDocument).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(saveAlertEditorDocument.mock.calls[0]![1].targetProfiles).toEqual([
      expect.objectContaining({ id: "landscape", enabled: true, reviewState: "ready" }),
      expect.objectContaining({ id: "vertical", enabled: true, reviewState: "needs-review" })
    ]);

    await user.click(screen.getByRole("button", { name: /^Vertical/u }));
    const verticalReviewWarning = (await screen.findByText(/This generated layout is editable/u)).closest(".alert-editor-page__profile-warning");
    expect(verticalReviewWarning).not.toBeNull();
    await user.click(within(verticalReviewWarning as HTMLElement).getByRole("button", { name: "Mark reviewed" }));
    expect(saveAlertEditorDocument).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledTimes(2));
    expect(saveAlertEditorDocument.mock.calls[1]![1].targetProfiles).toEqual([
      expect.objectContaining({ id: "landscape", enabled: true, reviewState: "ready" }),
      expect.objectContaining({ id: "vertical", enabled: true, reviewState: "ready" })
    ]);
  });
});

function NavigationProbe() {
  const navigation = useManagementNavigation();
  return <><button onClick={() => navigation.requestNavigation({ id: "modules-alerts" })} type="button">Leave editor</button>{navigation.guard}</>;
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

const assetApi: AssetApi = {
  listAssets: vi.fn(async () => []),
  importAsset: vi.fn(),
  getAssetFile: vi.fn(async () => new Blob(["image"], { type: "image/png" })),
  replaceAsset: vi.fn()
};

function editorDocument(): AlertEditorDocument {
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
        animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
      },
      {
        id: "layer-image",
        name: "Celebration",
        type: "image",
        visible: true,
        order: 1,
        assetId: "asset-celebration",
        animation: { mode: "preset", entrance: "scale", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
      }
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

function alertSetDetail(active = true): AlertSetDetail {
  return {
    overview: {
      id: "set-default",
      name: "Everyday alerts",
      active,
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

function channelPointDocument(overrides: Partial<AlertEditorDocument> = {}): AlertEditorDocument {
  return {
    ...editorDocument(),
    id: "alert-channel-points",
    eventType: "channel_point_redemption",
    name: "Shared custom rewards",
    conditions: [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }],
    templateVariables: [
      { key: "userName", label: "User name", description: "Display name for the redeemer." },
      { key: "rewardTitle", label: "Reward title", description: "Current reward title." },
      { key: "userInput", label: "User input", description: "Optional redemption input." }
    ],
    samplePayloads: [{
      id: "normal",
      label: "Hydrate redemption",
      kind: "built-in",
      payload: { userName: "James", rewardId: "reward-hydrate", rewardTitle: "Hydrate", userInput: "" }
    }],
    ...overrides
  };
}

function channelPointInventoryRow(
  document: AlertEditorDocument
): AlertSetDetail["inventory"][number] {
  return {
    id: document.parentAlertId ?? document.id,
    setId: document.setId,
    providerKind: document.providerKind,
    eventType: document.eventType,
    parentAlertId: null,
    name: document.kind === "default" ? document.name : "Shared custom rewards",
    kind: "default",
    enabled: document.kind === "default" ? document.enabled : true,
    conditions: document.conditions,
    weight: 1,
    priority: null,
    reviewState: "ready",
    targetProfileIds: document.targetProfiles.filter((profile) => profile.enabled).map((profile) => profile.id),
    previewText: "Channel point redemption preview"
  };
}

function channelPointAlertSetDetail(
  document: AlertEditorDocument,
  siblings: readonly AlertSetDetail["inventory"][number][] = []
): AlertSetDetail {
  const source = alertSetDetail(false);
  return {
    ...source,
    inventory: [channelPointInventoryRow(document), ...siblings]
  };
}

function renderChannelPointEditor(
  document: AlertEditorDocument,
  options: {
    readonly getTwitchCustomRewards?: AlertEditorPageApi["getTwitchCustomRewards"];
    readonly saveAlertEditorDocument?: AlertEditorPageApi["saveAlertEditorDocument"];
    readonly sendAlertEditorTest?: AlertEditorPageApi["sendAlertEditorTest"];
    readonly setDetail?: AlertSetDetail;
  } = {}
) {
  const getTwitchCustomRewards = options.getTwitchCustomRewards
    ?? vi.fn(async () => ({ rewards: [] }));
  const saveAlertEditorDocument = options.saveAlertEditorDocument
    ?? vi.fn(async (_alertId: string, saved: AlertEditorDocument) => saved);
  const sendAlertEditorTest = options.sendAlertEditorTest ?? vi.fn();
  const view = render(
    <DirtyNavigationProvider>
      <AlertEditorPage
        alertId={document.id}
        assetApi={assetApi}
        managementApi={{
          getAlertEditorDocument: vi.fn(async () => document),
          getAlertVariationAuthoringContext: vi.fn(async () => variationContext(document)),
          getTwitchCustomRewards,
          getAlertSet: vi.fn(async () => options.setDetail ?? channelPointAlertSetDetail(document)),
          listRegisteredProviders: vi.fn(async () => []),
          getAssetChangeImpact: vi.fn(),
          listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(),
          updateAssetMetadata: vi.fn(),
          saveAlertEditorDocument,
          sendAlertEditorTest
        }}
        onBack={() => undefined}
        onOpenAlert={() => undefined}
      />
    </DirtyNavigationProvider>
  );
  return { getTwitchCustomRewards, saveAlertEditorDocument, sendAlertEditorTest, ...view };
}

function customReward(
  id: string,
  title: string,
  overrides: Partial<TwitchCustomReward> = {}
): TwitchCustomReward {
  return {
    id,
    title,
    prompt: "",
    cost: 500,
    backgroundColor: "#00E5CB",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true,
    ...overrides
  };
}

function raidVariationDocument(
  overrides: Partial<AlertEditorDocument> & Pick<AlertEditorDocument, "id" | "name">
): AlertEditorDocument {
  return {
    ...editorDocument(),
    eventType: "raid",
    kind: "variation",
    parentAlertId: "alert-raid",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: 5,
    samplePayloads: [{
      id: "normal",
      label: "Normal raid",
      kind: "built-in",
      payload: { userName: "Raider", raidViewers: 50, amount: 50 }
    }],
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

function renderVariationSelectionEditor(
  document: AlertEditorDocument,
  siblings: readonly AlertVariationAuthoringContext["candidates"][number][],
  options: {
    readonly defaultEnabled?: boolean;
    readonly defaultPriority?: number | null;
    readonly defaultWeight?: number;
    readonly saveAlertEditorDocument?: AlertEditorPageApi["saveAlertEditorDocument"];
  } = {}
) {
  const context = variationContext(document, siblings);
  const authoringContext: AlertVariationAuthoringContext = {
    ...context,
    candidates: context.candidates.map((candidate) => candidate.kind === "default" ? {
      ...candidate,
      enabled: options.defaultEnabled ?? candidate.enabled,
      priority: options.defaultPriority ?? candidate.priority,
      weight: options.defaultWeight ?? candidate.weight
    } : candidate)
  };
  return render(
    <DirtyNavigationProvider>
      <AlertEditorPage
        alertId={document.id}
        assetApi={assetApi}
        managementApi={{
          getAlertEditorDocument: vi.fn(async () => document),
          getAlertVariationAuthoringContext: vi.fn(async () => authoringContext),
          getAlertSet: vi.fn(async () => alertSetDetail(false)),
          listRegisteredProviders: vi.fn(async () => []),
          getAssetChangeImpact: vi.fn(),
          listAssetLibraryItems: vi.fn(async () => []),
          deleteAsset: vi.fn(),
          updateAssetMetadata: vi.fn(),
          saveAlertEditorDocument: options.saveAlertEditorDocument
            ?? vi.fn(async (_alertId, saved) => saved),
          sendAlertEditorTest: vi.fn()
        }}
        onBack={() => undefined}
        onOpenAlert={() => undefined}
      />
    </DirtyNavigationProvider>
  );
}

function variationContext(
  document: AlertEditorDocument,
  siblings: readonly AlertVariationAuthoringContext["candidates"][number][] = []
): AlertVariationAuthoringContext {
  const ruleId = document.kind === "default" ? document.id : document.parentAlertId!;
  const defaultCandidate = {
    editorId: ruleId,
    variantId: `${ruleId}-default-resolver`,
    kind: "default" as const,
    name: document.kind === "default" ? document.name : "Default",
    enabled: document.kind === "default" ? document.enabled : true,
    conditions: [],
    weight: document.kind === "default" ? document.weight : 1,
    priority: document.kind === "default" ? document.priority : null
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
  return {
    ruleId,
    eventType: document.eventType,
    candidates: [defaultCandidate, ...selectedCandidate, ...siblings]
  };
}
