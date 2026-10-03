import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { TimerEventRule } from "@stream-jams/core";
import { TimerEventRulesEditor } from "./TimerEventRulesEditor.js";
import { TimerAdjustmentControls } from "./TimerAdjustmentControls.js";
import "./timers.css";

function TimerControls() {
  const [rules, setRules] = useState<readonly TimerEventRule[]>([]);
  const [message, setMessage] = useState("");
  return <div style={{ maxWidth: 720, padding: 24 }}><TimerEventRulesEditor rules={rules} onChange={setRules} /><TimerAdjustmentControls disabled={false} onApply={async input => { setMessage(`${input.action}: ${input.amountMs / 1000} seconds`); }} /><p role="status">{message}</p></div>;
}
const meta = { title: "Management/Timers/Event rules and corrections", component: TimerControls } satisfies Meta<typeof TimerControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConfigureRedemption: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Add event rule" }));
  await userEvent.type(canvas.getByLabelText("Reward ID (optional)"), "cat-paws");
  await userEvent.selectOptions(canvas.getByLabelText("Action"), "increment");
  await expect(canvas.getByLabelText("When timer is inactive")).toHaveValue("ignore");
  await userEvent.click(canvas.getByRole("button", { name: "Apply adjustment" }));
  await expect(canvas.getByRole("status")).toHaveTextContent("increment: 60 seconds");
} };
