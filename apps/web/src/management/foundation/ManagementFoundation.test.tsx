import type { ActionableManagementError } from "@stream-jams/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DestructiveConfirmationDialog } from "./DestructiveConfirmationDialog.js";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";
import { MaskedValue } from "./MaskedValue.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";

describe("management UI foundation", () => {
  it("presents actionable failures with correction and reference context", () => {
    const error: ActionableManagementError = {
      summary: "Twitch validation failed",
      cause: "The saved token expired.",
      nextStep: "Reconnect Twitch and retry validation.",
      severity: "error",
      occurredAt: "2026-07-15T02:00:00.000Z",
      referenceId: "ref-provider-17",
      correction: { label: "Open event source", route: "/manage/event-sources?provider=twitch-main" }
    };

    render(<ManagementErrorBanner error={error} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Twitch validation failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The saved token expired.");
    expect(screen.getByRole("alert")).toHaveTextContent("Reconnect Twitch and retry validation.");
    expect(screen.getByText("ref-provider-17")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open event source" })).toHaveAttribute(
      "href",
      "/manage/event-sources?provider=twitch-main"
    );
  });

  it("keeps a route key masked until explicitly revealed and reports copy success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(<MaskedValue label="Landscape browser-source URL" value="https://localhost/overlay/secret-key" />);

    expect(screen.queryByText("https://localhost/overlay/secret-key")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal Landscape browser-source URL" }));
    expect(screen.getByText("https://localhost/overlay/secret-key")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Landscape browser-source URL" }));
    expect(writeText).toHaveBeenCalledWith("https://localhost/overlay/secret-key");
    expect(screen.getByText("Copied Landscape browser-source URL.")).toBeInTheDocument();
  });

  it("requires typed confirmation before a high-risk action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirmationDialog
        actionLabel="Regenerate route key"
        confirmText="REGENERATE"
        consequences="Connected browser sources will stop receiving alerts."
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
        recovery="Update the browser source in OBS with the new URL."
        scope="Landscape live output"
        title="Regenerate this route key?"
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Regenerate route key" });
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByLabelText("Type REGENERATE to confirm"), "REGENERATE");
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("applies and persists an explicit theme preference", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("stream-jams-theme")).toBe("dark");
  });
});
