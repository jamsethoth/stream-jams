import { createScreenEffectDocument, screenEffectDocumentSchema, type ScreenEffectDocument } from "@stream-jams/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenEffectsPage } from "./ScreenEffectsPage.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";

afterEach(cleanup);

describe("ScreenEffectsPage", () => {
  it("shows inventory and compact Screen Effects browser-source status", async () => {
    render(<ScreenEffectsPage api={api()} generateId={(prefix) => `${prefix}-new`} onEdit={vi.fn()} />);

    expect(await screen.findByText("Confetti")).toBeInTheDocument();
    expect(screen.getByText("Screen Effects live")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal Screen Effects live Browser Source URL" }));
    expect(screen.getByLabelText("Screen Effects live Browser Source URL")).toHaveTextContent("/overlay/modules/screen-effects/live/");
    expect(screen.getByRole("link", { name: "Review trigger setup" })).toHaveAttribute("href", "/manage/event-sources");
  });

  it("opens a local new draft and confirms live enable changes", async () => {
    const user = userEvent.setup();
    const service = api();
    const onEdit = vi.fn();
    render(<ScreenEffectsPage api={service} generateId={(prefix) => `${prefix}-new`} onEdit={onEdit} />);
    await screen.findByText("Confetti");

    await user.click(screen.getByRole("button", { name: "New effect" }));
    expect(onEdit).toHaveBeenCalledWith("effect-new", true);
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

    await user.click(screen.getByRole("button", { name: "Regenerate URL" }));
    const dialog = screen.getByRole("dialog", { name: "Regenerate Screen Effects live URL?" });
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
  readonly status?: "available" | "create-required" | "regenerate-required";
  readonly url?: string | null;
} = {}): ScreenEffectsApi {
  const document = effect();
  const source = {
    id: "source-one",
    label: "Screen Effects live",
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
  return {
    list: vi.fn(async () => [document]),
    listBrowserSources: vi.fn(async () => [source]),
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
