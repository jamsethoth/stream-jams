import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayOutputsPanel } from "./OverlayOutputsPanel.js";
import type { OverlayClientView, OverlayOutputUrl } from "../management-api.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OverlayOutputsPanel", () => {
  it("creates, copies, regenerates, and revokes overlay output URLs", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText
      }
    });

    let outputs = [output({ copyableUrlStatus: "create-required", keyId: null, url: null })];
    const managementApi = {
      listOverlayOutputs: vi.fn(async () => outputs),
      listOverlayClients: vi.fn(async () => clients()),
      createOverlayOutputKey: vi.fn(async () => {
        const nextOutput = output({
          copyableUrlStatus: "available",
          keyId: "key-1",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first"
        });
        outputs = [nextOutput];
        return {
          keyId: "key-1",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first",
          output: nextOutput
        };
      }),
      regenerateOverlayOutputKey: vi.fn(async () => {
        const nextOutput = output({
          copyableUrlStatus: "available",
          keyId: "key-2",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_second"
        });
        outputs = [nextOutput];
        return {
          keyId: "key-2",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_second",
          output: nextOutput
        };
      }),
      revokeOverlayOutputKey: vi.fn(async () => {
        outputs = [output({ copyableUrlStatus: "create-required", keyId: null, url: null })];
      })
    };

    render(<OverlayOutputsPanel managementApi={managementApi} />);

    await user.click(await screen.findByRole("button", { name: "Create URL" }));
    await user.click(await screen.findByRole("button", { name: "Copy Alerts Live" }));
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(managementApi.createOverlayOutputKey).toHaveBeenCalledWith({
      overlayId: "default",
      scope: "module",
      moduleId: "alerts",
      purpose: "live"
    });
    expect(writeText).toHaveBeenCalledWith("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first");
    expect(managementApi.regenerateOverlayOutputKey).toHaveBeenCalledWith({
      overlayId: "default",
      scope: "module",
      moduleId: "alerts",
      purpose: "live"
    });
    expect(managementApi.revokeOverlayOutputKey).toHaveBeenCalledWith("key-2");
    await waitFor(() => expect(screen.getByText("Alerts Live URL revoked.")).toBeInTheDocument());
  });

  it("shows recoverability errors without guessing URLs", async () => {
    render(
      <OverlayOutputsPanel
        managementApi={{
          listOverlayOutputs: vi.fn(async () => [
            output({ copyableUrlStatus: "regenerate-required", keyId: "legacy", url: null })
          ]),
          listOverlayClients: vi.fn(async () => clients()),
          createOverlayOutputKey: vi.fn(),
          regenerateOverlayOutputKey: vi.fn(),
          revokeOverlayOutputKey: vi.fn()
        }}
      />
    );

    expect(await screen.findByText("Generate a URL to copy this output.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Alerts Live" })).not.toBeInTheDocument();
  });
});

function output(overrides: Pick<OverlayOutputUrl, "copyableUrlStatus" | "keyId" | "url">): OverlayOutputUrl {
  return {
    id: "module:alerts:live",
    overlayId: "default",
    label: "Alerts Live",
    scope: "module",
    moduleId: "alerts",
    purpose: "live",
    enabled: true,
    ...overrides
  };
}

function clients(): readonly OverlayClientView[] {
  return [
    {
      id: "client-1",
      overlayId: "default",
      scope: "module",
      moduleId: "alerts",
      purpose: "live",
      connectedAt: "2026-06-16T12:00:00.000Z",
      lastSeenAt: "2026-06-16T12:00:01.000Z",
      userAgent: "Playwright"
    }
  ];
}
