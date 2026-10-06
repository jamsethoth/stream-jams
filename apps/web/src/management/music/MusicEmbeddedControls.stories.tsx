import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { MusicNumberField } from "./MusicNumberField.js";
import { MusicCssEditor } from "./MusicCssEditor.js";

const meta = { title: "Management/Music embedded fields", component: MusicNumberField, tags: ["mantine-stage6d", "mantine-stage6d-closure", "mantine-stage6d-fields"], args: { label: "Widget width (px)", value: 640, min: 64, max: 1920, onCommit: fn() } } satisfies Meta<typeof MusicNumberField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InvalidDraftThenEnter: Story = { play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("spinbutton", { name: "Widget width (px)" });
  fireEvent.change(input, { target: { value: "" } });
  await userEvent.click(input);
  await userEvent.tab();
  await expect(args.onCommit).not.toHaveBeenCalled();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("data-error", "true");
  const error = canvas.getByRole("alert");
  await expect(input).toHaveAttribute("aria-describedby", error.id);
  await waitFor(() => expect(getComputedStyle(input).borderColor).toBe(getComputedStyle(error).color));
  fireEvent.change(input, { target: { value: "650" } });
  await userEvent.click(input);
  await userEvent.keyboard("{Enter}");
  await expect(args.onCommit).toHaveBeenCalledWith(650);
  await expect(args.onCommit).toHaveBeenCalledTimes(1);
} };

function CssFailure() {
  const [value, setValue] = useState({ ...createDefaultMusicModuleConfig().css, enabled: true, source: ".unsupported { color: red; }" });
  return <MusicCssEditor value={value} validation={{ valid: false, errors: [{ line: 1, column: 1, message: "Use a documented Music selector." }] }} checking={false} onChange={setValue} onDisable={() => setValue({ ...value, enabled: false })} />;
}

export const CssValidationAssociation: Story = { render: () => <CssFailure />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const css = canvas.getByRole("textbox", { name: "Custom CSS" });
  await expect(css).toHaveAttribute("aria-invalid", "true");
  await expect(css).toHaveAttribute("aria-describedby", "music-css-help music-css-error");
  await expect(canvas.getAllByRole("alert")).toHaveLength(1);
  await userEvent.click(canvas.getByRole("button", { name: "Disable custom CSS" }));
  await expect(css).toHaveValue(".unsupported { color: red; }");
  await expect(canvas.getByRole("checkbox", { name: "Enable custom CSS" })).not.toBeChecked();
} };
