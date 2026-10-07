import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderManagement } from "../../test-support/render-management.js";
import { MusicNumberField } from "./MusicNumberField.js";
import { MusicCssEditor } from "./MusicCssEditor.js";

afterEach(cleanup);

describe("Music embedded field contracts", () => {
  it("retains blank and fractional drafts until blur, associates invalid feedback, then commits Enter once", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderManagement(<MusicNumberField label="Widget width" value={640} min={64} max={1920} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton", { name: "Widget width" });
    fireEvent.change(input, { target: { value: "" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    fireEvent.change(input, { target: { value: "640.5" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "650" } });
    input.focus();
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(650);
    expect(input).toBeValid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows negative fractional spacing and follows external saved values", () => {
    const onCommit = vi.fn();
    const view = renderManagement(<MusicNumberField label="Letter spacing" value={0} min={-8} max={32} allowFraction onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton", { name: "Letter spacing" });
    fireEvent.change(input, { target: { value: "-1.5" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(-1.5);
    view.rerender(<MusicNumberField label="Letter spacing" value={2} min={-8} max={32} allowFraction onCommit={onCommit} />);
    expect(input).toHaveValue(2);
  });

  it("keeps one CSS validation owner with actual invalid/help associations", () => {
    renderManagement(<MusicCssEditor value={{ enabled: true, source: ".sj-title { color: red; }", styleContractVersion: 1 }} checking={false} validation={{ valid: false, errors: [{ line: 1, column: 1, message: "Use a documented selector." }] }} onChange={vi.fn()} onDisable={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Custom CSS" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "music-css-help music-css-error");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Use a documented selector.");
  });
});
