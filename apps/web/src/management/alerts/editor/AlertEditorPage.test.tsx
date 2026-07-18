import type { AlertEditorDocument, AlertSetDetail } from "@stream-jams/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../../navigation/dirty-navigation.js";
import { AlertEditorPage } from "./AlertEditorPage.js";

afterEach(cleanup);

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
    render(
      <DirtyNavigationProvider>
        <AlertEditorPage
          alertId="alert-follow"
          assetApi={assetApi}
          managementApi={{
            getAlertEditorDocument: vi.fn(async () => document),
            getAlertSet: vi.fn(async () => alertSetDetail()),
            getAssetChangeImpact: vi.fn(),
            listAssetLibraryItems: vi.fn(async () => []),
            deleteAsset: vi.fn(),
            updateAssetMetadata: vi.fn(),
            saveAlertEditorDocument,
            sendAlertEditorTest
          }}
          onBack={() => undefined}
          onOpenAlert={onOpenAlert}
          targetProfileId="landscape"
        />
      </DirtyNavigationProvider>
    );

    expect(await screen.findByRole("heading", { name: "New follower" })).toBeInTheDocument();
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
});

function NavigationProbe() {
  const navigation = useManagementNavigation();
  return <><button onClick={() => navigation.requestNavigation({ id: "modules-alerts" })} type="button">Leave editor</button>{navigation.guard}</>;
}

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
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", name: "New follower", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", name: "New raid", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}
