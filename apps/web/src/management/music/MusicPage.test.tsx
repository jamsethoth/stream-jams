import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import type { AssetApi } from "../assets/asset-api.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../navigation/dirty-navigation.js";
import { MusicPage } from "./MusicPage.js";
import { heightForMusicImage } from "./MusicBrandingEditor.js";

afterEach(cleanup);
const renderPage = (overrides: Parameters<typeof createStoryManagementApi>[0] = {}, assetApi: AssetApi = createStoryAssetApi()) => {
  const api = createStoryManagementApi({ listAssetLibraryItems: async () => [], listMusicOutputs: async () => [], ...overrides });
  render(<DirtyNavigationProvider><MusicPage api={api} assetApi={assetApi} /></DirtyNavigationProvider>);
  return api;
};

async function openEditorControls() {
  fireEvent.click(await screen.findByRole("button", { name: "Expand configuration" }));
  fireEvent.click(screen.getByRole("button", { name: "Expand custom css" }));
  fireEvent.click(screen.getByRole("button", { name: "Expand browser sources" }));
  await screen.findByRole("heading", { name: "Appearance" });
  await screen.findByLabelText("Custom CSS");
}

describe("Music appearance", () => {
  it("orders browser sources, preview, configuration and CSS with independent disclosures", async () => {
    renderPage();
    const config = await screen.findByRole("button", { name: "Expand configuration" });
    const sources = screen.getByRole("region", { name: "Music output links" });
    const preview = screen.getByRole("region", { name: "Music preview" });
    const settings = screen.getByRole("region", { name: "Configuration" });
    const css = screen.getByRole("region", { name: "Custom CSS settings" });
    expect(sources.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(css) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(config).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(config);
    expect(await screen.findByLabelText("Widget width (px)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Expand custom css" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Collapse configuration" }));
    expect(screen.queryByLabelText("Widget width (px)")).toBeNull();
    expect(screen.getByRole("button", { name: "Disable custom CSS" })).toBeVisible();
  });

  it("mirrors graphical color and opacity choices with validated RGBA hex input", async () => {
    const user = userEvent.setup();
    renderPage();
    await openEditorControls();
    fireEvent.change(screen.getByLabelText("Title color"), { target: { value: "#123456" } });
    expect(screen.getByLabelText("Title RGBA")).toHaveValue("#123456FF");
    fireEvent.change(screen.getByLabelText("Title opacity"), { target: { value: "50" } });
    expect(screen.getByLabelText("Title RGBA")).toHaveValue("#12345680");
    const hex = screen.getByLabelText("Title RGBA");
    await user.clear(hex);
    await user.type(hex, "#ABCDEF40");
    await user.tab();
    expect(screen.getByLabelText("Title color")).toHaveValue("#abcdef");
    expect(screen.getByLabelText("Title opacity")).toHaveValue("25");
    await user.clear(hex);
    await user.type(hex, "invalid");
    await user.tab();
    expect(hex).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title color")).toHaveValue("#abcdef");
  });

  it("keeps profile and view drafts independent, then persists only on Save", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (enabled, config) => ({ enabled, config }));
    renderPage({ saveMusicConfig: save });
    await openEditorControls();
    expect(within(screen.getByRole("region", { name: "Music preview" })).getByTestId("music-widget")).toHaveStyle({ width: "640px", height: "178px" });
    await user.selectOptions(screen.getByLabelText("Preview view"), "compact");
    expect(within(screen.getByRole("region", { name: "Music preview" })).getByTestId("music-widget")).toHaveStyle({ width: "480px", height: "118px" });
    expect(screen.getByLabelText("Widget width (px)")).toHaveValue(480);
    await user.clear(screen.getByLabelText("Widget width (px)"));
    await user.type(screen.getByLabelText("Widget width (px)"), "510");
    await user.tab();
    expect(save).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Output profile"), "vertical");
    expect(screen.getByLabelText("Widget width (px)")).toHaveValue(480);
    await user.selectOptions(screen.getByLabelText("Output profile"), "landscape");
    expect(screen.getByLabelText("Widget width (px)")).toHaveValue(510);
    await user.selectOptions(screen.getByLabelText("Preview view"), "full");
    expect(screen.getByLabelText("Widget width (px)")).toHaveValue(640);
    await user.click(screen.getByRole("button", { name: "Save Music appearance" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1].profiles.landscape.views.compact.widthPx).toBe(510);
    expect(save.mock.calls[0]?.[1].profiles.vertical.views.compact.widthPx).toBe(480);
  });

  it("shows CSS errors and retains the last valid preview while disabling preserves source", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (enabled, config) => ({ enabled, config }));
    renderPage({ saveMusicConfig: save });
    await openEditorControls();
    const textarea = await screen.findByLabelText("Custom CSS");
    await user.click(screen.getByLabelText("Enable custom CSS"));
    fireEvent.change(textarea, { target: { value: ".sj-title { color: red; }" } });
    await waitFor(() => expect(screen.getByText("CSS is valid.")).toBeInTheDocument());
    const shadow = screen.getByTestId("music-widget").shadowRoot!;
    await waitFor(() => expect(shadow.querySelectorAll("style")[2]?.textContent).toContain("color:red"));
    fireEvent.change(textarea, { target: { value: ".sj-title { background: url(https://example.com/pixel); }" } });
    expect(await screen.findByText(/Line 1, column/u)).toBeInTheDocument();
    expect(shadow.querySelectorAll("style")[2]?.textContent).toContain("color:red");
    expect(screen.getByLabelText("Full preview metadata")).toHaveTextContent("A long song title");
    await user.click(screen.getByRole("button", { name: "Disable custom CSS" }));
    expect(screen.getByLabelText("Custom CSS")).toHaveValue(".sj-title { background: url(https://example.com/pixel); }");
    await user.click(screen.getByRole("button", { name: "Clear CSS" }));
    expect(screen.getByLabelText("Custom CSS")).toHaveValue("");
  });

  it("retains CSS and branding during theme reset and exposes live/test output links", async () => {
    const user = userEvent.setup();
    const config = createDefaultMusicModuleConfig();
    config.css = { ...config.css, source: ".sj-title { color: red; }", enabled: true };
    config.profiles.landscape.views.full.branding.assetId = "brand-a";
    renderPage({ getMusicConfig: async () => ({ enabled: false, config }), listMusicOutputs: async () => [
      { id: "live", overlayId: "default", moduleId: "music", scope: "module", targetProfileId: "landscape", purpose: "live", label: "Music Landscape Live", enabled: false, keyId: "key", url: "http://127.0.0.1:39187/overlay/modules/music/live/example", copyableUrlStatus: "available" },
      { id: "test", overlayId: "default", moduleId: "music", scope: "module", targetProfileId: "landscape", purpose: "test", label: "Music Landscape Test", enabled: false, keyId: "key", url: "http://127.0.0.1:39187/overlay/modules/music/test/example", copyableUrlStatus: "available" }
    ] });
    await openEditorControls();
    await user.click(screen.getByRole("button", { name: "Reset current view to theme" }));
    expect(screen.getByLabelText("Custom CSS")).toHaveValue(config.css.source);
    expect(screen.getByText("Image brand-a unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open live output" })).toHaveAttribute("href", expect.stringContaining("/live/"));
    expect(screen.getByRole("link", { name: "Open test output" })).toHaveAttribute("href", expect.stringContaining("/test/"));
  });

  it("creates the selected profile output link through the existing output service", async () => {
    const user = userEvent.setup();
    const output = { id: "landscape-live", overlayId: "default", moduleId: "music", scope: "module" as const, targetProfileId: "landscape" as const, purpose: "live" as const, label: "Music Landscape Live", enabled: false, keyId: null, url: null, copyableUrlStatus: "create-required" as const };
    const create = vi.fn(async () => ({ output: { ...output, keyId: "key", url: "http://127.0.0.1:39187/overlay/modules/music/live/example", copyableUrlStatus: "available" as const }, keyId: "key", url: "http://127.0.0.1:39187/overlay/modules/music/live/example" }));
    renderPage({ listMusicOutputs: async () => [output], createOverlayOutputKey: create });
    await openEditorControls();
    await user.click(screen.getByRole("button", { name: "Create live output link" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: "landscape" }));
    expect(await screen.findByRole("link", { name: "Open live output" })).toHaveAttribute("href", expect.stringContaining("/live/"));
  });

  it("clamps explicit image aspect result within height limits", () => {
    expect(heightForMusicImage(640, { width: 320, height: 160 })).toBe(320);
    expect(heightForMusicImage(640, { width: 320, height: 10_000 })).toBe(1080);
    expect(heightForMusicImage(640, { width: null, height: 160 })).toBeNull();
    expect(heightForMusicImage(640, { width: 0, height: 160 })).toBeNull();
  });

  it("keeps a newer draft when an earlier save resolves late", async () => {
    const user = userEvent.setup();
    let complete!: (result: { enabled: boolean; config: ReturnType<typeof createDefaultMusicModuleConfig> }) => void;
    const save = vi.fn((enabled: boolean, config: ReturnType<typeof createDefaultMusicModuleConfig>) => new Promise<{ enabled: boolean; config: ReturnType<typeof createDefaultMusicModuleConfig> }>(resolve => { void enabled; void config; complete = resolve; }));
    renderPage({ saveMusicConfig: save });
    await openEditorControls();
    await user.click(screen.getByLabelText("Enable Music module after saving"));
    await user.click(screen.getByRole("button", { name: "Save Music appearance" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.selectOptions(screen.getByLabelText("Preview view"), "compact");
    await user.clear(screen.getByLabelText("Widget width (px)"));
    await user.type(screen.getByLabelText("Widget width (px)"), "515");
    await user.tab();
    complete({ enabled: true, config: save.mock.calls[0]![1] });
    expect(await screen.findByText(/Earlier Music appearance saved. Newer edits remain unsaved./u)).toBeInTheDocument();
    expect(screen.getByLabelText("Widget width (px)")).toHaveValue(515);
  });

  it("chooses image and font assets independently and clearing either preserves CSS", async () => {
    const user = userEvent.setup();
    const image = storyAssetLibraryItems[0]!;
    const font = { ...image, id: "font-a", displayName: "Brand font", originalFileName: "brand.woff2", mediaType: "font" as const, mimeType: "font/woff2", width: null, height: null };
    const assetApi = createStoryAssetApi({ createPreview: () => new Promise(() => undefined) });
    renderPage({ listAssetLibraryItems: async () => [image, font] }, assetApi);
    await openEditorControls();
    await user.click(screen.getByRole("button", { name: "Choose branding image" }));
    await user.click(await screen.findByRole("button", { name: "Use selected asset" }));
    expect(screen.getByText("Follower burst")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose title font" }));
    await user.click(await screen.findByRole("button", { name: "Use selected asset" }));
    expect(screen.getByText("font-a")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Custom CSS"), { target: { value: ".sj-title { color: red; }" } });
    await user.click(screen.getByRole("button", { name: "Remove title font" }));
    expect(screen.getByText("Follower burst")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.getByLabelText("Custom CSS")).toHaveValue(".sj-title { color: red; }");
  });

  it("uses the shared dirty navigation decision flow", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/music");
    const api = createStoryManagementApi({ listAssetLibraryItems: async () => [], listMusicOutputs: async () => [] });
    render(<DirtyNavigationProvider><MusicNavigationHarness api={api} /></DirtyNavigationProvider>);
    await openEditorControls();
    await user.click(screen.getByLabelText("Enable Music module after saving"));
    await user.click(screen.getByRole("button", { name: "Leave Music editor" }));
    expect(screen.getByRole("heading", { name: "Leave with unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.location.pathname).toBe("/manage/modules/music");
  });

  it("keeps navigation blocked if a newer edit appears during Save and leave", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/music");
    let complete!: (result: { enabled: boolean; config: ReturnType<typeof createDefaultMusicModuleConfig> }) => void;
    const save = vi.fn((enabled: boolean, config: ReturnType<typeof createDefaultMusicModuleConfig>) => new Promise<{ enabled: boolean; config: ReturnType<typeof createDefaultMusicModuleConfig> }>(resolve => { void enabled; void config; complete = resolve; }));
    const api = createStoryManagementApi({ saveMusicConfig: save, listAssetLibraryItems: async () => [], listMusicOutputs: async () => [] });
    render(<DirtyNavigationProvider><MusicNavigationHarness api={api} /></DirtyNavigationProvider>);
    await openEditorControls();
    await user.click(screen.getByLabelText("Enable Music module after saving"));
    await user.click(screen.getByRole("button", { name: "Leave Music editor" }));
    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Widget width (px)"), { target: { value: "700" } });
    fireEvent.blur(screen.getByLabelText("Widget width (px)"));
    complete({ enabled: true, config: save.mock.calls[0]![1] });
    expect(await screen.findByText(/Unable to save changes before leaving/u)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/manage/modules/music");
  });
});

function MusicNavigationHarness({ api }: { readonly api: ReturnType<typeof createStoryManagementApi> }) {
  const navigation = useManagementNavigation();
  return <><button onClick={() => navigation.requestNavigation({ id: "home" })} type="button">Leave Music editor</button><MusicPage api={api} assetApi={createStoryAssetApi()} />{navigation.guard}</>;
}
