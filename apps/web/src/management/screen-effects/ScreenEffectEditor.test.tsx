import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type AssetLibraryItem,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../assets/asset-api.js";
import type { AudioApi } from "../audio/audio-api.js";
import type { ManagementApi } from "../management-api.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { ScreenEffectEditor } from "./ScreenEffectEditor.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

afterEach(cleanup);

describe("ScreenEffectEditor", () => {
  it("keeps a new disabled draft local until explicit valid Save", async () => {
    const user = userEvent.setup();
    const api = effectApi();
    renderEditor({ api, create: true });

    expect(await screen.findByDisplayValue("New Screen Effect")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose visual asset" }));
    await user.click(await screen.findByRole("button", { name: /Image one/ }));
    await user.click(screen.getByRole("button", { name: "Use selected asset" }));
    expect(api.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      id: "effect-new",
      enabled: false,
      variants: [expect.objectContaining({
        visual: expect.objectContaining({ assetId: "image-one" }),
        visualOutputs: { browserSource: true, desktop: false }
      })]
    }));

    const name = screen.getByLabelText("Effect name");
    await user.clear(name);
    await user.type(name, "Saved then edited");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(
      "effect-new",
      expect.objectContaining({ name: "Saved then edited" }),
      false
    );
  });

  it("previews silently and confirms exact saved live-test destinations", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect();
    const api = effectApi(saved);
    renderEditor({ api, create: false, document: saved });

    await user.click(await screen.findByRole("button", { name: "Preview silently" }));
    expect(screen.getByRole("dialog", { name: "Default" })).toHaveTextContent("Audio is intentionally suppressed");
    expect(api.test).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close preview" }));

    await user.click(screen.getByRole("button", { name: "Live Test…" }));
    const dialog = screen.getByRole("dialog", { name: "Send live Screen Effect test?" });
    expect(dialog).toHaveTextContent("OBS Browser Source visual");
    expect(dialog).toHaveTextContent("OBS Browser Source audio");
    expect(dialog).toHaveTextContent("Headphones");
    await user.click(screen.getByRole("button", { name: "Confirm live test" }));
    expect(api.test).toHaveBeenCalledWith(saved.id, saved.variants[0]!.id, true);
  });

  it("retains the draft after a failed save", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect(false);
    const api = effectApi(saved);
    vi.mocked(api.update).mockRejectedValue(new Error("Storage failed (ref-effect-save)"));
    renderEditor({ api, create: false, document: saved });

    const name = await screen.findByLabelText("Effect name");
    await user.clear(name);
    await user.type(name, "Unsaved effect name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Storage failed");
    expect(screen.getByLabelText("Effect name")).toHaveValue("Unsaved effect name");
  });
});

function renderEditor(options: { readonly api: ScreenEffectsApi; readonly create: boolean; readonly document?: ScreenEffectDocument }) {
  render(<DirtyNavigationProvider><ScreenEffectEditor
    api={options.api}
    assetApi={assetApi()}
    audioApi={audioApi()}
    create={options.create}
    effectId={options.document?.id ?? "effect-new"}
    generateId={(prefix) => `${prefix}-new`}
    managementApi={managementApi()}
    onBack={() => {}}
  /></DirtyNavigationProvider>);
}

function effectApi(document = enabledEffect(false)): ScreenEffectsApi {
  return {
    list: vi.fn(async () => [document]),
    listBrowserSources: vi.fn(async () => []),
    get: vi.fn(async () => document),
    create: vi.fn(async (candidate) => candidate),
    update: vi.fn(async (_id, candidate) => candidate),
    remove: vi.fn(async () => {}),
    test: vi.fn(async (effectId, variantId) => ({ effectId, occurrenceId: `occurrence-${variantId}`, status: "queued" as const }))
  };
}

function enabledEffect(enabled = true): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id: "effect-one", name: "Effect one", defaultVariantId: "variant-one" });
  return screenEffectDocumentSchema.parse({
    ...draft,
    enabled,
    variants: [{
      ...draft.variants[0],
      visual: { mediaType: "video", assetId: "video-one", layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }, playEmbeddedAudio: true, audioVolume: 0.5 },
      sound: { assetId: "tone-one", volume: 0.6 },
      outputs: { browserSource: true, deviceRouteIds: ["headphones"] },
      visualOutputs: { browserSource: true, desktop: false }
    }]
  });
}

const assets: readonly AssetLibraryItem[] = [
  asset("image-one", "Image one", "image"),
  asset("video-one", "Video one", "video"),
  asset("tone-one", "Tone one", "audio")
];

function asset(id: string, displayName: string, mediaType: "image" | "video" | "audio"): AssetLibraryItem {
  return {
    id, displayName, mediaType, originalFileName: `${id}.bin`, mimeType: mediaType === "image" ? "image/png" : mediaType === "video" ? "video/mp4" : "audio/mpeg",
    sizeBytes: 100, width: null, height: null, durationMs: null, tags: [], health: "available", createdAt: "2026-09-13T12:00:00.000Z", updatedAt: "2026-09-13T12:00:00.000Z",
    usage: { assetId: id, totalUsageCount: 0, usages: [] }
  };
}

function managementApi(): ManagementApi {
  return {
    listAssetLibraryItems: vi.fn(async () => assets),
    getTwitchStatus: vi.fn(async () => ({ connected: false, authorizationState: "disconnected", missingScopes: [], account: null })),
    getTwitchCustomRewards: vi.fn(async () => ({ rewards: [] })),
    listRegisteredProviders: vi.fn(async () => []),
    getStreamerBotSubscriptions: vi.fn(async () => { throw new Error("not configured"); })
  } as unknown as ManagementApi;
}

function audioApi(): AudioApi {
  return {
    getStatus: vi.fn(async () => ({ capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false, routes: [{ route: { id: "headphones", name: "Headphones", deviceId: "device-one", deviceLabel: "Headphones" }, state: "ready" as const }] })),
    createRoute: vi.fn(), updateRoute: vi.fn(), deleteRoute: vi.fn(), testRoute: vi.fn(), retry: vi.fn()
  } as unknown as AudioApi;
}

function assetApi(): AssetApi {
  return {
    listAssets: vi.fn(async () => []), importAsset: vi.fn(), getAssetFile: vi.fn(async () => new Blob()), replaceAsset: vi.fn()
  };
}
