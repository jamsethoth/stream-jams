import { Button } from "@mantine/core";
import type { ActionableManagementError } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DestructiveConfirmationDialog } from "./DestructiveConfirmationDialog.js";

const meta = { title: "Management/Confirmation lifecycle", component: DestructiveConfirmationDialog, tags: ["mantine-assets"] } satisfies Meta<typeof DestructiveConfirmationDialog>;
export default meta;
type Story = StoryObj;

const failure: ActionableManagementError = { summary: "Fixture deletion failed", cause: "The saved usage changed.", nextStep: "Review the same asset and explicitly retry.", severity: "error", occurredAt: null, referenceId: "fixture-confirmation", correction: null };

function ConfirmationLifecycle() {
  const [open, setOpen] = useState(false);
  const [exists, setExists] = useState(true);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const attempts = useRef(0);
  const fallback = useRef<HTMLHeadingElement>(null);
  return <>
    <h2 ref={fallback} tabIndex={-1}>Disposable assets</h2>
    {exists ? <Button onClick={() => { setError(null); setOpen(true); }}>Review deletion</Button> : null}
    <DestructiveConfirmationDialog actionLabel="Delete fixture" confirmText="DELETE" consequences="This disposable fixture will be permanently removed." error={error} onCancel={() => setOpen(false)} onConfirm={async () => {
      if (++attempts.current === 1) { setError(failure); return; }
      setExists(false); setOpen(false);
    }} open={open} recovery={null} scope="Disposable asset" targetId="fixture-asset" title="Delete fixture?" restoreFocusFallbackRef={fallback} />
  </>;
}

export const FailureReopenResetAndRemovedTriggerFocus: Story = {
  render: () => <ConfirmationLifecycle />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(document.body);
    const trigger = canvas.getByRole("button", { name: "Review deletion" });
    await userEvent.click(trigger);
    await userEvent.type(await body.findByLabelText("Type DELETE to confirm"), "DELETE");
    await userEvent.click(body.getByRole("button", { name: "Delete fixture" }));
    await expect(await body.findByText("Fixture deletion failed")).toBeVisible();
    await expect(body.getByLabelText("Type DELETE to confirm")).toHaveValue("DELETE");
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await expect(body.getByLabelText("Type DELETE to confirm")).toHaveValue("");
    await expect(body.queryByText("Fixture deletion failed")).toBeNull();
    await userEvent.type(body.getByLabelText("Type DELETE to confirm"), "DELETE");
    await userEvent.click(body.getByRole("button", { name: "Delete fixture" }));
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Disposable assets" })).toHaveFocus());
    await expect(body.queryByRole("dialog")).toBeNull();
  }
};
