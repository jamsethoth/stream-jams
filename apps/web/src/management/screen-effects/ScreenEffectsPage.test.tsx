import { createStoryEffectSets } from "../../stories/screen-effect-set-fixtures.js";
import { createScreenEffectDocument, screenEffectDocumentSchema, type ScreenEffectDocument } from "@stream-jams/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenEffectsPage } from "./ScreenEffectsPage.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

afterEach(cleanup);

describe("ScreenEffectsPage", () => {
  it("creates an inactive set and requires confirmation before making it live", async () => {
    const user = userEvent.setup();
    const service = api();
    render(<ScreenEffectsPage api={service} generateId={() => "new-set"} onEdit={vi.fn()} />);
    await screen.findByText("Confetti");
    await user.click(screen.getByRole("button", { name: "Create set" }));
    await user.type(screen.getByLabelText("Set name"), "Gaming");
    await user.click(screen.getByRole("button", { name: "Save set" }));
    const gaming = await screen.findByRole("region", { name: "Gaming Screen Effect set" });
    expect(within(gaming).getByText("Inactive set")).toBeVisible();
    expect((await service.listSets()).find((set) => set.active)?.name).toBe("Default");
    await user.click(within(gaming).getByRole("button", { name: "Activate set" }));
    expect((await service.listSets()).find((set) => set.active)?.name).toBe("Default");
    await user.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(await within(gaming).findByText("Live set")).toBeVisible();
    expect((await service.listSets()).filter((set) => set.active).map((set) => set.name)).toEqual(["Gaming"]);
    expect(within(gaming).getByRole("button", { name: "Delete set" })).toBeDisabled();
  });

  it("opens the chosen variant from its collapsed effect", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<ScreenEffectsPage api={api()} onEdit={onEdit} />);
    await user.click(await screen.findByText("Confetti"));
    await user.click(screen.getByRole("button", { name: "Default variant" }));
    expect(onEdit).toHaveBeenCalledWith("effect-one", false, "screen-effects-default", "variant-one");
  });

  it("shows inventory and compact Screen Effects browser-source status", async () => {
    render(<ScreenEffectsPage api={api()} generateId={(prefix) => `${prefix}-new`} onEdit={vi.fn()} />);

    expect(await screen.findByText("Confetti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browser sources" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "Browser sources" }));
    expect(screen.getByText("Screen Effects Live")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal Screen Effects Live Browser Source URL" }));
    expect(screen.getByLabelText("Screen Effects Live Browser Source URL")).toHaveTextContent("/overlay/modules/screen-effects/live/");
    expect(screen.getByRole("link", { name: "Review trigger setup" })).toHaveAttribute("href", "/manage/event-sources");
  });

  it("shows each browser-source purpose once", async () => {
    render(<ScreenEffectsPage
      api={api({ includeTestSource: true, status: "create-required", url: null })}
      onEdit={vi.fn()}
    />);

    const browserSources = await screen.findByRole("region", { name: "Browser sources" });
    await userEvent.click(screen.getByRole("button", { name: "Browser sources" }));
    const liveSource = within(browserSources).getByText("Screen Effects Live").closest("li");
    const testSource = within(browserSources).getByText("Screen Effects Test").closest("li");

    expect(liveSource).not.toBeNull();
    expect(testSource).not.toBeNull();
    expect(within(liveSource!).getByText("create required")).toBeInTheDocument();
    expect(within(testSource!).getByText("create required")).toBeInTheDocument();
  });

  it("opens a local new draft and confirms live enable changes", async () => {
    const user = userEvent.setup();
    const service = api();
    const onEdit = vi.fn();
    render(<ScreenEffectsPage api={service} generateId={(prefix) => `${prefix}-new`} onEdit={onEdit} />);
    await screen.findByText("Confetti");

    await user.click(screen.getByRole("button", { name: "New effect" }));
    expect(onEdit).toHaveBeenCalledWith("effect-new", true, "screen-effects-default");
    await user.click(screen.getByText("Confetti"));
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(service.update).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Enable Screen Effect?" });
    expect(dialog).toHaveTextContent("changes live admission");
    await user.click(screen.getByRole("button", { name: "Confirm change" }));

    expect(service.update).toHaveBeenCalledWith("effect-one", expect.objectContaining({ enabled: true }), true);
  });

  it("controls module enablement and creates its browser-source URL", async () => {
    const user = userEvent.setup();
    const service = api({ moduleEnabled: false, status: "create-required", url: null });
    render(<ScreenEffectsPage api={service} onEdit={vi.fn()} />);
    await screen.findByText("Confetti");

    await user.click(screen.getByRole("button", { name: "Enable Screen Effects module" }));
    await user.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(service.setModuleEnabled).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Browser sources" }));
    await user.click(screen.getByRole("button", { name: "Create URL" }));
    expect(service.createBrowserSource).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: "screen-effects",
      purpose: "live"
    }));
  });

  it("requires typed confirmation before invalidating a browser-source URL", async () => {
    const user = userEvent.setup();
    const service = api();
    render(<ScreenEffectsPage api={service} onEdit={vi.fn()} />);
    await screen.findByText("Confetti");

    await user.click(screen.getByRole("button", { name: "Browser sources" }));
    await user.click(screen.getByRole("button", { name: "Regenerate URL" }));
    const dialog = screen.getByRole("dialog", { name: "Regenerate Screen Effects Live URL?" });
    const confirm = within(dialog).getByRole("button", { name: "Regenerate URL" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type REGENERATE to continue"), "REGENERATE");
    await user.click(confirm);

    expect(service.regenerateBrowserSource).toHaveBeenCalledWith(expect.objectContaining({
      keyId: "source-key-one"
    }));
  });
});

function effect(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id: "effect-one", name: "Confetti", defaultVariantId: "variant-one" });
  return screenEffectDocumentSchema.parse({
    ...draft,
    variants: [{ ...draft.variants[0], sound: { assetId: "tone-one", volume: 1 }, outputs: { browserSource: true, deviceRouteIds: [] } }]
  });
}

function api(options: {
  readonly moduleEnabled?: boolean;
  readonly includeTestSource?: boolean;
  readonly status?: "available" | "create-required" | "regenerate-required";
  readonly url?: string | null;
} = {}): ScreenEffectsApi {
  const document = effect();
  const source = {
    id: "source-one",
    label: "Screen Effects Live",
    purpose: "live" as const,
    overlayId: "default",
    scope: "module" as const,
    moduleId: "screen-effects" as const,
    targetProfileId: null,
    enabled: options.moduleEnabled ?? true,
    keyId: options.status === "create-required" ? null : "source-key-one",
    url: options.url === undefined ? "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_secret" : options.url,
    status: options.status ?? "available"
  };
  const testSource = {
    ...source,
    id: "source-two",
    label: "Screen Effects Test",
    purpose: "test" as const,
    keyId: options.status === "create-required" ? null : "source-key-two",
    url: options.url === undefined ? "http://127.0.0.1:39187/overlay/modules/screen-effects/test/ovl_secret" : options.url
  };
  return {
    ...createStoryEffectSets([document.id]),
    list: vi.fn(async () => [document]),
    listBrowserSources: vi.fn(async () => options.includeTestSource === true ? [source, testSource] : [source]),
    getModuleEnabled: vi.fn(async () => options.moduleEnabled ?? true),
    setModuleEnabled: vi.fn(async (enabled) => enabled),
    createBrowserSource: vi.fn(async () => ({ ...source, keyId: "created-key", url: "http://127.0.0.1/created", status: "available" as const })),
    regenerateBrowserSource: vi.fn(async () => ({ ...source, keyId: "regenerated-key", url: "http://127.0.0.1/regenerated", status: "available" as const })),
    get: vi.fn(async () => document),
    create: vi.fn(async (candidate) => candidate),
    update: vi.fn(async (_id, candidate) => candidate),
    remove: vi.fn(async () => {}),
    test: vi.fn(async (effectId) => ({ effectId, status: "queued" as const, occurrenceId: "occurrence-one" }))
  };
}
