import { createScreenEffectDocument, screenEffectDocumentSchema, type ScreenEffectDocument } from "@stream-jams/core";
import { cleanup, render, screen } from "@testing-library/react";
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
});

function effect(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id: "effect-one", name: "Confetti", defaultVariantId: "variant-one" });
  return screenEffectDocumentSchema.parse({
    ...draft,
    variants: [{ ...draft.variants[0], sound: { assetId: "tone-one", volume: 1 }, outputs: { browserSource: true, deviceRouteIds: [] } }]
  });
}

function api(): ScreenEffectsApi {
  const document = effect();
  return {
    list: vi.fn(async () => [document]),
    listBrowserSources: vi.fn(async () => [{ id: "source-one", label: "Screen Effects live", purpose: "live", enabled: true, status: "available" }] as const),
    get: vi.fn(async () => document),
    create: vi.fn(async (candidate) => candidate),
    update: vi.fn(async (_id, candidate) => candidate),
    remove: vi.fn(async () => {}),
    test: vi.fn(async (effectId) => ({ effectId, status: "queued" as const, occurrenceId: "occurrence-one" }))
  };
}
