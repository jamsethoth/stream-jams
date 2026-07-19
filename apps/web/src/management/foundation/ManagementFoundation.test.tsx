import type { ActionableManagementError } from "@stream-jams/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DestructiveConfirmationDialog } from "./DestructiveConfirmationDialog.js";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast } from "./ManagementToast.js";
import { MaskedValue } from "./MaskedValue.js";
import { ModalSurface } from "./ModalSurface.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";

describe("management UI foundation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("summarizes serialized validation issues without exposing their schema codes", () => {
    render(<ManagementErrorBanner error={{
      summary: "Server settings were not saved",
      cause: '[{"code":"invalid_value","path":["port"],"message":"Port must be between 1 and 65535."}]',
      nextStep: "Correct the port and try again.",
      severity: "error",
      occurredAt: "2026-07-15T02:00:00.000Z",
      referenceId: "ref-settings-17",
      correction: { label: "Open settings", route: "/manage/settings" }
    }} />);

    const alert = screen.getByText("Server settings were not saved").closest("[role='alert']");
    expect(alert).toHaveTextContent("port: Port must be between 1 and 65535.");
    expect(alert).not.toHaveTextContent("invalid_value");
    expect(screen.getByText("Correct the port and try again.")).toBeInTheDocument();
    expect(screen.getByText("ref-settings-17")).toBeInTheDocument();
  });

  it("keeps a malformed structured cause as safe text", () => {
    render(<ManagementErrorBanner error={{
      summary: "Server settings were not saved",
      cause: "{not valid JSON}",
      nextStep: "Retry the request.",
      severity: "error",
      occurredAt: null,
      referenceId: null,
      correction: null
    }} />);

    expect(screen.getByText("{not valid JSON}")).toBeInTheDocument();
  });

  it("omits valid structured causes that have no safe issue messages", () => {
    const error: ActionableManagementError = {
      summary: "Server settings were not saved",
      cause: '[{"code":"invalid_value"}]',
      nextStep: "Retry the request.",
      severity: "error",
      occurredAt: null,
      referenceId: null,
      correction: null
    };
    const { container, rerender } = render(<ManagementErrorBanner error={error} />);

    expect(container).not.toHaveTextContent("invalid_value");

    rerender(<ManagementErrorBanner error={{ ...error, cause: '{"stack":"internal details"}' }} />);
    expect(container).not.toHaveTextContent("internal details");
    expect(container).toHaveTextContent("Retry the request.");
  });

  it.each([
    ["success", "status", "management-toast--success", 4_000],
    ["warning", "status", "management-toast--warning", 4_000],
    ["failure", "alert", "management-toast--failure", 8_000]
  ] as const)("renders and expires %s feedback", (tone, role, className, timeoutMs) => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(<ManagementToast notice={{ tone, message: `${tone} result` }} onDismiss={onDismiss} />);

    expect(within(container).getByRole(role)).toHaveClass("management-toast", className);
    act(() => vi.advanceTimersByTime(timeoutMs - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();

  });

  it("keeps actionable metadata and controls inside the failure toast", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const referenceId = `err_${"long-reference-".repeat(12)}`;
    const { container } = render(<ManagementErrorToast error={{
      summary: "Save failed",
      cause: "The local service rejected the request.",
      nextStep: "Retry after checking Diagnostics.",
      severity: "error",
      occurredAt: "2026-07-19T22:45:00.000Z",
      referenceId,
      correction: null
    }} onDismiss={onDismiss} />);

    const toast = within(container).getByRole("alert").closest(".management-toast");
    expect(toast).toContainElement(within(container).getByText(referenceId));
    expect(toast).toContainElement(within(container).getByRole("link", { name: "Open diagnostics" }));
    await user.click(within(container).getByRole("button", { name: "Dismiss error" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not duplicate a diagnostics correction link", () => {
    render(<ManagementErrorToast error={{
      summary: "Save failed",
      cause: "The local service rejected the request.",
      nextStep: "Inspect Diagnostics for details.",
      severity: "error",
      occurredAt: "2026-07-19T22:45:00.000Z",
      referenceId: "ref-save-17",
      correction: { label: "Open Diagnostics", route: "/manage/diagnostics?reference=ref-save-17" }
    }} onDismiss={() => undefined} />);

    expect(screen.getAllByRole("link", { name: "Open Diagnostics" })).toHaveLength(1);
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
    expect(screen.getByText("Copied Landscape browser-source URL.").closest(".management-toast")).toHaveClass("management-toast--success");
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

  it("contains keyboard focus within an open modal", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <ModalSurface labelledBy="focus-modal-title" onCancel={vi.fn()} open>
          <h2 id="focus-modal-title">Focus modal</h2>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </ModalSurface>
      </>
    );

    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  });
});
