import type { ActionableManagementError } from "@stream-jams/core";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderManagement as render } from "../../test-support/render-management.js";
import { DestructiveConfirmationDialog } from "./DestructiveConfirmationDialog.js";

afterEach(cleanup);
const failure: ActionableManagementError = { summary: "Delete failed", cause: "Asset is in use", nextStep: "Remove its usages and retry.", severity: "error", occurredAt: null, referenceId: "fixture-delete", correction: null };
const base = { actionLabel: "Delete", confirmText: "DELETE", consequences: "Permanently removed", recovery: null, scope: "Fixture asset", title: "Delete fixture?", targetId: "asset-a", open: true } as const;

it("guards same-event repeat submissions and locks Cancel, Escape and backdrop while a Promise is pending", async () => {
  const user = userEvent.setup();
  let complete!: () => void;
  const onConfirm = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  const onCancel = vi.fn();
  render(<DestructiveConfirmationDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />);
  await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
  const confirm = screen.getByRole("button", { name: "Delete" });
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByLabelText("Type DELETE to confirm")).toBeDisabled();
  await user.keyboard("{Escape}");
  fireEvent.click(document.querySelector(".mantine-Modal-overlay")!);
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
  await act(async () => complete());
  expect(confirm).toBeEnabled();
  expect(screen.getByLabelText("Type DELETE to confirm")).toHaveValue("DELETE");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("preserves same-target confirmation for failure/retry and resets draft and stale error on reopen or stable target change", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const props = { ...base, onConfirm, onCancel: vi.fn() };
  const { rerender } = render(<DestructiveConfirmationDialog {...props} />);
  await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
  rerender(<DestructiveConfirmationDialog {...props} error={failure} />);
  expect(screen.getByRole("alert")).toHaveTextContent("fixture-delete");
  expect(screen.getByLabelText("Type DELETE to confirm")).toHaveValue("DELETE");
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalledOnce();
  rerender(<DestructiveConfirmationDialog {...props} targetId="asset-b" error={failure} />);
  expect(screen.getByLabelText("Type DELETE to confirm")).toHaveValue("");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
  rerender(<DestructiveConfirmationDialog {...props} targetId="asset-b" open={false} error={failure} />);
  rerender(<DestructiveConfirmationDialog {...props} targetId="asset-b" error={failure} />);
  expect(screen.getByLabelText("Type DELETE to confirm")).toHaveValue("");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("restores focus to an available fallback when successful deletion removes its trigger", async () => {
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [exists, setExists] = useState(true);
    const fallback = useRef<HTMLHeadingElement>(null);
    return <><h2 ref={fallback} tabIndex={-1}>Assets</h2>{exists ? <button onClick={() => setOpen(true)}>Review delete</button> : null}<DestructiveConfirmationDialog {...base} confirmText={undefined} open={open} restoreFocusFallbackRef={fallback} onCancel={() => setOpen(false)} onConfirm={async () => { setExists(false); setOpen(false); }} /></>;
  }
  render(<Fixture />);
  await userEvent.click(screen.getByRole("button", { name: "Review delete" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Assets" })).toHaveFocus());
});
