import type { AlertEditorDocument, AlertSetDetail } from "@stream-jams/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    await waitFor(() => expect(saveAlertEditorDocument).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({ layers: expect.arrayContaining([expect.objectContaining({ template: "Welcome, James!" })]) })
    ));

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Local preview is running.")).toBeInTheDocument();
    expect(sendAlertEditorTest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(sendAlertEditorTest).toHaveBeenCalledWith(
      "alert-follow",
      expect.objectContaining({ targetProfileId: "landscape", includeAudio: false, includeTts: false })
    ));
    expect(await screen.findByText(/Queued on Landscape.*ref-editor-test/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vertical/ }));
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();

    await user.type(screen.getByRole("searchbox", { name: "Search alerts" }), "raid");
    await user.click(screen.getByRole("button", { name: /New raid/ }));
    expect(onOpenAlert).toHaveBeenCalledWith("alert-raid", "vertical");
  });

  it("guards route changes while the alert has unsaved edits", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/modules/alerts/editor/alert-follow");
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
    expect(window.location.pathname).toBe("/modules/alerts/editor/alert-follow");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/modules/alerts");
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
      { id: "alert-follow", setId: "set-default", providerKind: "twitch", eventType: "follow", name: "New follower", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Follow preview" },
      { id: "alert-raid", setId: "set-default", providerKind: "twitch", eventType: "raid", name: "New raid", kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Raid preview" }
    ],
    browserSources: []
  };
}
