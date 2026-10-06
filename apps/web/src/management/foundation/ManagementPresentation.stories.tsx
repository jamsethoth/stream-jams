import { Button, Select, TextInput } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ActionMenu } from "./ActionMenu.js";
import { ManagementModalSurface, ManagementModalTitle } from "./ManagementModalSurface.js";
import { ManagementToast } from "./ManagementToast.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";

function FoundationExample({ state = "loaded" }: { readonly state?: "loaded" | "loading" | "empty" | "error" | "success" }) {
  const [open, setOpen] = useState(false);
  return <section style={{ maxWidth: 560 }}><h2>Management controls</h2><ThemeSwitcher />
    <TextInput label="Workspace name" description="Labels and help remain associated at compact width." error={state === "error" ? "Use a recognizable name before saving." : undefined} defaultValue="A long recognizable workspace name for an international streaming setup" />
    <Button disabled={state === "loading"} loading={state === "loading"}>Save changes</Button>
    {state === "empty" ? <p>No items yet. Create one to continue.</p> : null}
    {state === "success" ? <ManagementToast notice={{ tone: "success", message: "Changes saved." }} onDismiss={() => undefined} /> : null}
    <ActionMenu label="Workspace actions" items={[
      { label: "Edit appearance", accessibleLabel: "Edit appearance", onSelect: () => setOpen(true) },
      { label: "Unavailable action", accessibleLabel: "Unavailable action", disabled: true, onSelect: () => undefined },
      { label: "Delete workspace", accessibleLabel: "Delete workspace", tone: "danger", onSelect: () => undefined }
    ]} />
    <ManagementModalSurface labelledBy="foundation-dialog" open={open} onCancel={() => setOpen(false)}>
      <ManagementModalTitle>Edit workspace appearance</ManagementModalTitle>
      <Select label="Appearance" data={["Automatic", "Compact", "Comfortable"]} defaultValue="Automatic" />
      <Button onClick={() => setOpen(false)}>Done</Button>
    </ManagementModalSurface>
  </section>;
}
const meta = { title: "Management/Presentation foundation", component: FoundationExample, tags: ["mantine-foundation", "mantine-portals"] } satisfies Meta<typeof FoundationExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Pending: Story = { args: { state: "loading" } };
export const Empty: Story = { args: { state: "empty" } };
export const FieldError: Story = {
  args: { state: "error" },
  tags: ["mantine-stage6c-closure"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Workspace name" });
    const correction = canvas.getByText("Use a recognizable name before saving.");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field.getAttribute("aria-describedby")).toContain(correction.id);
    await expect(getComputedStyle(field).borderColor).toBe(getComputedStyle(correction).color);
    await userEvent.click(field);
    await expect(field).toHaveFocus();
    await expect(getComputedStyle(field).borderColor).toBe(getComputedStyle(correction).color);
  }
};
export const Success: Story = { args: { state: "success" } };
export const OpenDialogAndSelectPortal: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Workspace actions" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit appearance" }));
    const dialog = await body.findByRole("dialog", { name: "Edit workspace appearance" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Appearance" }));
    await expect(await body.findByRole("option", { name: "Compact" })).toBeVisible();
  }
};
export const CompactRtlDark: Story = {
  globals: { locale: "ar" },
  decorators: [(Story) => <div style={{ width: 358, maxWidth: "100%" }}><Story /></div>],
  play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole("radio", { name: "Dark" })); }
};
export const MenuDialogSelectKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Workspace actions" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const edit = await body.findByRole("menuitem", { name: "Edit appearance" });
    await userEvent.keyboard("{End}");
    await expect(body.getByRole("menuitem", { name: "Delete workspace" })).toHaveFocus();
    await userEvent.keyboard("{Home}{Enter}");
    await expect(edit).not.toBeVisible();
    const dialog = await body.findByRole("dialog", { name: "Edit workspace appearance" });
    const appearance = within(dialog).getByRole("combobox", { name: "Appearance" });
    await waitFor(() => expect(appearance).toHaveFocus());
    await userEvent.click(appearance);
    await userEvent.click(await body.findByRole("option", { name: "Compact" }));
    await expect(appearance).toHaveValue("Compact");
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  }
};
