import { ManagementHttpError } from "../management-http-client.js";
import { createStoryEffectSets } from "../../stories/screen-effect-set-fixtures.js";
import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type AssetLibraryItem,
  type RegisteredProviderView,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../assets/asset-api.js";
import type { AudioApi } from "../audio/audio-api.js";
import type { ManagementApi } from "../management-api.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { ScreenEffectEditor } from "./ScreenEffectEditor.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ScreenEffectEditor", () => {
  it("does not offer animation controls for Screen Effects", async () => {
    renderEditor({ api: effectApi(enabledEffect(false)), create: false, document: enabledEffect(false) });
    expect(await screen.findByRole("heading", { name: "Variant settings" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Use a preset animation" })).not.toBeInTheDocument();
  });

  it("groups related asset commands into consistently spaced rows", async () => {
    renderEditor({ api: effectApi(enabledEffect(false)), create: false, document: enabledEffect(false) });
    expect(await screen.findByRole("button", { name: "Choose visual asset" })).toHaveClass("button");
    expect(screen.getByRole("button", { name: "Choose visual asset" }).parentElement).toHaveClass("screen-effects-button-row");
    expect(screen.getByRole("button", { name: "Choose sound asset" }).parentElement).toHaveClass("screen-effects-button-row");
  });

  it("edits every media volume as a percentage through 200 percent", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect(false);
    const api = effectApi(saved);
    renderEditor({ api, create: false, document: saved });

    expect(await screen.findByRole("spinbutton", { name: "Sound volume" })).toHaveValue(60);
    expect(screen.getByRole("spinbutton", { name: "Embedded audio volume" })).toHaveValue(50);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Sound volume" }), { target: { value: "200" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Embedded audio volume" }), { target: { value: "200" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(saved.id, expect.objectContaining({
      variants: [expect.objectContaining({
        sound: expect.objectContaining({ volume: 2 }),
        visual: expect.objectContaining({ audioVolume: 2 })
      })]
    }), false));
  });

  it("preserves a draft and requests confirmation if its inactive set became live", async () => {
    const saved = enabledEffect();
    const api = effectApi(saved);
    api.listSets = async () => [{ id: "inactive", name: "Gaming", active: false, effectIds: [saved.id] }];
    api.update = vi.fn(async (_id, candidate, confirmed) => {
      if (!confirmed) throw new ManagementHttpError("This set is now live", "SCREEN_EFFECT_LIVE_IMPACT_CONFIRMATION_REQUIRED", null);
      return candidate;
    });
    renderEditor({ api, create: false, document: saved });
    await userEvent.click(await screen.findByRole("tab", { name: "Effect" }));
    await userEvent.clear(screen.getByLabelText("Effect name"));
    await userEvent.type(screen.getByLabelText("Effect name"), "Kept draft");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/u }));
    await userEvent.click(await screen.findByRole("button", { name: "Save live changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Screen Effect saved");
    expect(api.update).toHaveBeenLastCalledWith(saved.id, expect.objectContaining({ name: "Kept draft" }), true);
  });

  it("switches inspector sections by keyboard without losing draft changes", async () => {
    const user = userEvent.setup();
    renderEditor({ api: effectApi(), create: true });
    const effectTab = await screen.findByRole("tab", { name: "Effect" });
    await user.click(effectTab);
    await user.clear(screen.getByLabelText("Effect name"));
    await user.type(screen.getByLabelText("Effect name"), "Retained draft");
    await user.click(effectTab);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Triggers" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Trusted triggers" })).toBeVisible();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByLabelText("Effect name")).toHaveValue("Retained draft");
  });

  it("keeps a new disabled draft local until explicit valid Save", async () => {
    const user = userEvent.setup();
    const api = effectApi();
    renderEditor({ api, create: true });

    await user.click(await screen.findByRole("tab", { name: "Effect" }));
    expect(await screen.findByDisplayValue("New Screen Effect")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("tab", { name: "Variant" }));
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
    }), "screen-effects-default");

    await user.click(await screen.findByRole("tab", { name: "Effect" }));
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

  it("previews locally without live delivery and confirms saved test destinations", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect();
    const api = effectApi(saved);
    renderEditor({ api, create: false, document: saved });

    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.getByRole("region", { name: "Effect canvas" })).toHaveTextContent("Local draft preview with sound");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.test).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop preview" }));

    await user.click(screen.getByRole("button", { name: "Test saved…" }));
    const dialog = screen.getByRole("dialog", { name: "Test saved Screen Effect?" });
    expect(dialog).toHaveTextContent("Saved input");
    expect(dialog).toHaveTextContent("OBS Browser Source visual");
    expect(dialog).toHaveTextContent("OBS Browser Source audio");
    expect(dialog).toHaveTextContent("Headphones");
    expect(api.test).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm live test" }));
    expect(api.test).toHaveBeenCalledWith(saved.id, saved.variants[0]!.id, true);
  });

  it("retains the draft after a failed save", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect(false);
    const api = effectApi(saved);
    vi.mocked(api.update).mockRejectedValue(new Error("Storage failed (ref-effect-save)"));
    renderEditor({ api, create: false, document: saved });

    await user.click(await screen.findByRole("tab", { name: "Effect" }));
    const name = await screen.findByLabelText("Effect name");
    await user.clear(name);
    await user.type(name, "Unsaved effect name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Storage failed");
    expect(screen.getByLabelText("Effect name")).toHaveValue("Unsaved effect name");
  });

  it("keeps successful editor context visible and reports retryable source failures", async () => {
    const user = userEvent.setup();
    const getTwitchStatus = vi.fn()
      .mockRejectedValueOnce(new Error("Twitch status unavailable (ref-effect-context)"))
      .mockResolvedValueOnce({
        connected: false,
        authorizationState: "disconnected",
        missingScopes: [],
        account: null
      });
    renderEditor({
      api: effectApi(enabledEffect(false)),
      create: false,
      document: enabledEffect(false),
      managementApi: managementApi({ getTwitchStatus })
    });

    await user.click(await screen.findByRole("tab", { name: "Effect" }));
    expect(await screen.findByLabelText("Effect name")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Twitch connection");
    expect(screen.getByRole("alert")).toHaveTextContent("ref-effect-context");

    await user.click(await screen.findByRole("tab", { name: "Variant" }));
    await user.click(screen.getByRole("button", { name: "Choose visual asset" }));
    expect(await screen.findByRole("button", { name: /Image one/u })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Retry editor context" }));

    await waitFor(() => expect(screen.queryByText("Some editor context could not be loaded.")).not.toBeInTheDocument());
    expect(getTwitchStatus).toHaveBeenCalledTimes(2);
  });

  it("preserves edits made while a save request is in flight", async () => {
    const user = userEvent.setup();
    const saved = enabledEffect(false);
    const api = effectApi(saved);
    let finishSave!: () => void;
    vi.mocked(api.update).mockImplementation(async (_id, candidate) => new Promise((resolve) => {
      finishSave = () => resolve(candidate);
    }));
    renderEditor({ api, create: false, document: saved });

    await user.click(await screen.findByRole("tab", { name: "Effect" }));
    const name = await screen.findByLabelText("Effect name");
    await user.clear(name);
    await user.type(name, "Submitted name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());

    await user.clear(name);
    await user.type(name, "Edited while saving");
    await act(async () => finishSave());

    expect(name).toHaveValue("Edited while saving");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("confirms variant removal and persists it through Save", async () => {
    const user = userEvent.setup();
    const saved = effectWithWeightedVariant();
    const api = effectApi(saved);
    renderEditor({ api, create: false, document: saved });

    await user.click(await screen.findByRole("button", { name: "Alternate variant" }));
    expect(screen.getByRole("button", { name: "Remove variant" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove variant" }));

    const dialog = screen.getByRole("dialog", { name: "Remove Alternate variant?" });
    expect(dialog).toHaveTextContent("The variant will be removed from this draft");
    await user.click(within(dialog).getByRole("button", { name: "Remove variant" }));

    expect(screen.queryByRole("button", { name: "Alternate variant" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Default variant" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.update).toHaveBeenCalledWith(
      saved.id,
      expect.objectContaining({ variants: [expect.objectContaining({ id: "variant-one" })] }),
      false
    );
  });

  it("restores focus after variant removal leaves the draft invalid", async () => {
    const user = userEvent.setup();
    const saved = effectWithWeightedVariant();
    renderEditor({ api: effectApi(saved), create: false, document: saved });

    await user.click(await screen.findByRole("button", { name: "Alternate variant" }));
    await user.clear(screen.getByLabelText("Variant name"));
    expect(screen.getByRole("button", { name: "Copy variant" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Default variant" }));
    await user.click(screen.getByRole("button", { name: "Remove variant" }));
    await user.click(within(screen.getByRole("dialog", { name: "Remove Default variant?" })).getByRole("button", { name: "Remove variant" }));

    expect(screen.getByRole("button", { name: "New variant" })).toHaveFocus();
  });

  it("marks unadvertised Streamer.bot bindings unavailable and omits them from new trigger choices", async () => {
    const saved = screenEffectDocumentSchema.parse({
      ...enabledEffect(false),
      bindings: [{
        id: "binding-missing",
        kind: "streamerbot-event",
        providerId: "provider-streamerbot",
        sourceKey: "OBS",
        eventType: "MissingEvent"
      }]
    });
    const streamerBotProvider: RegisteredProviderView = {
      id: "provider-streamerbot",
      name: "Streamer.bot",
      kind: "streamerbot",
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      liveStatus: "healthy",
      validatedAt: "2026-09-13T12:00:00.000Z",
      error: null,
      usedByAlertCount: 0
    };
    const providerManagementApi = managementApi({
      listRegisteredProviders: vi.fn(async () => [streamerBotProvider]),
      getStreamerBotSubscriptions: vi.fn(async () => ({
        providerId: "provider-streamerbot",
        available: true,
        sources: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }],
        selected: [{ sourceKey: "OBS", eventTypes: ["MissingEvent"] }],
        unavailableSelections: [{ sourceKey: "OBS", eventTypes: ["MissingEvent"] }],
        twitchBroadcasterId: null
      }))
    });

    renderEditor({ api: effectApi(saved), create: false, document: saved, managementApi: providerManagementApi });

    await userEvent.click(await screen.findByRole("tab", { name: "Triggers" }));
    expect(await screen.findByText("Unavailable — review event source setup")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OBS / MissingEvent" })).not.toBeInTheDocument();
  });

  it("shows one weighted model and simulates its local selection distribution", async () => {
    const user = userEvent.setup();
    const base = enabledEffect();
    const saved = screenEffectDocumentSchema.parse({
      ...base,
      variants: [
        { ...base.variants[0]!, weight: 1 },
        { ...base.variants[0]!, id: "variant-alternate", name: "Alternate", weight: 3 }
      ]
    });
    const api = effectApi(saved);
    let selection = 0;
    vi.spyOn(Math, "random").mockImplementation(() => selection++ % 4 === 0 ? 0 : 0.5);
    renderEditor({ api, create: false, document: saved });

    expect(await screen.findByLabelText("Variant weight")).toBeEnabled();
    expect(screen.queryByLabelText("Variant kind")).not.toBeInTheDocument();
    expect(screen.getByText("Weight 1 · 25% expected · Enabled")).toBeVisible();
    expect(screen.getByText("Weight 3 · 75% expected · Enabled")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Simulate 1,000 selections" }));

    const table = screen.getByRole("table", { name: "Weight simulation" });
    expect(within(table).getByRole("row", { name: "Default 1 25% 250 25%" })).toBeVisible();
    expect(within(table).getByRole("row", { name: "Alternate 3 75% 750 75%" })).toBeVisible();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.test).not.toHaveBeenCalled();
  });

  it("creates a blank variant and explains queue priority without exposing effect cooldown", async () => {
    const user = userEvent.setup();
    renderEditor({ api: effectApi(enabledEffect()), create: false, document: enabledEffect() });

    await user.click(await screen.findByRole("button", { name: "New variant" }));

    expect(screen.getByLabelText("Variant name")).toHaveValue("Variant 2");
    expect(screen.getByRole("checkbox", { name: "Variant enabled" })).not.toBeChecked();
    expect(screen.getByText("Weight 1 · 0% expected · Disabled")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Effect" }));
    expect(screen.getByLabelText("Queue priority")).toBeVisible();
    expect(screen.getByText(/Higher numbers are queued first when one event matches multiple effects/)).toBeVisible();
    expect(screen.queryByLabelText("Effect cooldown")).not.toBeInTheDocument();
  });

  it("leaves a draft invalid when its final enabled variant is disabled", async () => {
    const user = userEvent.setup();
    renderEditor({ api: effectApi(enabledEffect()), create: false, document: enabledEffect() });

    const enabled = await screen.findByRole("checkbox", { name: "Variant enabled" });
    expect(enabled).toBeEnabled();
    await user.click(enabled);

    expect(screen.getByText(/Enable at least one variant/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

function renderEditor(options: {
  readonly api: ScreenEffectsApi;
  readonly create: boolean;
  readonly document?: ScreenEffectDocument;
  readonly managementApi?: ManagementApi;
}) {
  render(<DirtyNavigationProvider><ScreenEffectEditor
    api={options.api}
    assetApi={assetApi()}
    audioApi={audioApi()}
    create={options.create}
    effectId={options.document?.id ?? "effect-new"}
    generateId={(prefix) => `${prefix}-new`}
    managementApi={options.managementApi ?? managementApi()}
    onBack={() => {}}
  /></DirtyNavigationProvider>);
}

function effectApi(document = enabledEffect(false)): ScreenEffectsApi {
  return {
    ...createStoryEffectSets([document.id]),
    list: vi.fn(async () => [document]),
    listBrowserSources: vi.fn(async () => []),
    getModuleEnabled: vi.fn(async () => true),
    setModuleEnabled: vi.fn(async (enabled) => enabled),
    createBrowserSource: vi.fn(async (source) => source),
    regenerateBrowserSource: vi.fn(async (source) => source),
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

function effectWithWeightedVariant(): ScreenEffectDocument {
  const base = enabledEffect(false);
  return screenEffectDocumentSchema.parse({
    ...base,
    variants: [
      base.variants[0],
      {
        ...base.variants[0],
        id: "variant-two",
        name: "Alternate",
        enabled: true
      }
    ]
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

function managementApi(overrides: Partial<ManagementApi> = {}): ManagementApi {
  return {
    listAssetLibraryItems: vi.fn(async () => assets),
    getTwitchStatus: vi.fn(async () => ({ connected: false, authorizationState: "disconnected", missingScopes: [], account: null })),
    getTwitchCustomRewards: vi.fn(async () => ({ rewards: [] })),
    listRegisteredProviders: vi.fn(async () => []),
    getStreamerBotSubscriptions: vi.fn(async () => { throw new Error("not configured"); }),
    ...overrides
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
