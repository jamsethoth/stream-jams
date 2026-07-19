import type { AlertEditorDocument, AlertSetDetail, RegisteredProviderView } from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../../navigation/dirty-navigation.js";
import { AlertEditorPage } from "./AlertEditorPage.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AlertEditorPage", () => {
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
            sendAlertEditorTest
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
    await user.keyboard("{End}");
    expect(eventTab).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(layersTab).toHaveAttribute("aria-selected", "true");
    expect(layersTab).toHaveAttribute("tabindex", "0");
    expect(alertTab).toHaveAttribute("tabindex", "-1");
    expect(layersTab).toHaveAttribute("aria-controls", "alert-editor-panel-layers");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "alert-editor-panel-layers");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "alert-editor-tab-layers");
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();
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
    expect(sendAlertEditorTest).not.toHaveBeenCalled();
    const firstPreviewLayer = screen.getByRole("button", { name: "Message layer" });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Message layer" })).not.toBe(firstPreviewLayer);

    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(sendAlertEditorTest).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({ targetProfileId: "landscape", includeAudio: true, includeTts: true })
    ));
    expect(await screen.findByText(/Queued on Landscape.*ref-editor-test/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();

    await user.type(screen.getByRole("searchbox", { name: "Search alerts" }), "raid");
    await user.click(screen.getByRole("button", { name: /New raid/ }));
    expect(onOpenAlert).toHaveBeenCalledWith("alert-raid", "vertical");
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

  it("requires Save Discard or Cancel before switching profiles with unsaved changes", async () => {
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
    const dialog = screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Landscape alert canvas" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).getByRole("button", { name: "Discard and switch" }));
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message template" })).toHaveValue("Thanks, {userName}!");

    await user.click(screen.getByRole("button", { name: /Landscape/ }));
    await user.clear(screen.getByRole("textbox", { name: "Message template" }));
    await user.type(screen.getByRole("textbox", { name: "Message template" }), "Save this change");
    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch profiles with unsaved changes?" })).getByRole("button", { name: "Save and switch" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledOnce());
    expect(screen.getByRole("region", { name: "Vertical alert canvas" })).toBeInTheDocument();
  });

  it("remembers canvas zoom by profile and confirms before replacing an edited target layout", async () => {
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
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("125%");
    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("100%");

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
    expect(screen.getByRole("status", { name: "Canvas zoom" })).toHaveTextContent("125%");
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
        { id: "layer-tts", name: "Speech", type: "tts", visible: true, order: 3, enabled: true, providerId: "speakerbot", template: "Hello {userName}", animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }
      ]
    };
    const sendAlertEditorTest = vi.fn();
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
            sendAlertEditorTest
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
    expect(sendAlertEditorTest).not.toHaveBeenCalled();
    const seek = screen.getByRole("slider", { name: "Preview position" });
    fireEvent.change(seek, { target: { value: "1200" } });
    expect(seek).toHaveValue("1200");
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

    expect(await screen.findByText("Studio Speaker.bot")).toBeInTheDocument();
    expect(screen.getByText("Speaker.bot is used for live TTS.")).toBeInTheDocument();
    const enabled = screen.getByRole("checkbox", { name: "Enable TTS for this alert" });
    expect(enabled).toBeChecked();
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
      priority: 5
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
    const variationConditions = screen.getByRole("group", { name: "Variation conditions" });
    await user.click(within(variationConditions).getByRole("button", { name: "Add raid viewer minimum" }));
    const viewerMinimum = within(variationConditions).getByRole("spinbutton", { name: "Variation conditions Raid viewer minimum" });
    await user.clear(viewerMinimum);
    await user.type(viewerMinimum, "25");
    await user.click(within(variationConditions).getByRole("button", { name: "Add ingest provider restriction" }));
    await user.selectOptions(
      within(variationConditions).getByRole("combobox", { name: "Variation conditions Ingest provider restriction" }),
      "streamerbot"
    );
    await user.clear(screen.getByRole("spinbutton", { name: "Variation weight" }));
    await user.type(screen.getByRole("spinbutton", { name: "Variation weight" }), "4");
    await user.clear(screen.getByRole("spinbutton", { name: "Variation priority" }));
    await user.type(screen.getByRole("spinbutton", { name: "Variation priority" }), "8");
    await user.clear(screen.getByRole("spinbutton", { name: "Cooldown (seconds)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Cooldown (seconds)" }), "15");
    await user.clear(screen.getByRole("spinbutton", { name: "Rule priority" }));
    await user.type(screen.getByRole("spinbutton", { name: "Rule priority" }), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      variation.id,
      expect.objectContaining({
        weight: 4,
        priority: 8,
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

  it("offers only applicable normalized conditions for expanded event families", async () => {
    const cases: readonly {
      readonly eventType: AlertEditorDocument["eventType"];
      readonly expected: readonly string[];
      readonly absent?: string;
    }[] = [
      { eventType: "gift_subscription", expected: ["Add gift tier"] },
      { eventType: "community_gift", expected: ["Add gift tier", "Add gift count minimum"] },
      { eventType: "hype_train_progress", expected: ["Add level minimum", "Add progress minimum", "Add total minimum"] },
      { eventType: "poll_end", expected: ["Add total votes minimum", "Add terminal status"] },
      { eventType: "prediction_end", expected: ["Add total points minimum", "Add participant minimum", "Add terminal status"] },
      { eventType: "stream_online", expected: ["Add stream type"] },
      { eventType: "stream_offline", expected: ["Add ingest provider restriction"], absent: "Add stream type" }
    ];

    for (const { eventType, expected, absent } of cases) {
      const user = userEvent.setup();
      const document = { ...editorDocument(), id: `alert-${eventType}`, eventType };
      const view = render(
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
      for (const label of expected) expect(within(conditions).getByRole("button", { name: label })).toBeInTheDocument();
      if (absent !== undefined) expect(within(conditions).queryByRole("button", { name: absent })).not.toBeInTheDocument();
      view.unmount();
    }
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
    await user.click(within(conditions).getByRole("button", { name: "Add terminal status" }));
    const status = within(conditions).getByRole("combobox", { name: "Rule conditions Terminal status" });
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
    await user.click(within(conditions).getByRole("button", { name: "Add raid viewer minimum" }));
    const input = within(conditions).getByRole("spinbutton", { name: "Variation conditions Raid viewer minimum" });
    await user.clear(input);
    await user.type(input, "0");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(within(conditions).getByRole("alert")).toHaveTextContent("Raid viewer minimum must be 1 or greater.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("preserves and displays an existing condition outside the authoring catalog", async () => {
    const user = userEvent.setup();
    const document: AlertEditorDocument = {
      ...editorDocument(),
      conditions: [{ field: "providerId", operator: "equals", value: "twitch" }]
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
    expect(conditions).toHaveTextContent('providerIdequals "twitch"');
    expect(within(conditions).queryByRole("spinbutton", { name: /providerId/u })).not.toBeInTheDocument();
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
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", parentAlertId: null, name: "New follower", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", parentAlertId: null, name: "New raid", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}
