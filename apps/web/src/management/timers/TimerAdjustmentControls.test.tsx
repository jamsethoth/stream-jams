import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TimerAdjustmentControls } from "./TimerAdjustmentControls.js";

it("applies explicit add, subtract and set commands and rejects invalid amounts", async () => {
  const user = userEvent.setup(); const onApply = vi.fn(async () => {});
  render(<TimerAdjustmentControls disabled={false} onApply={onApply} />);
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  expect(onApply).toHaveBeenLastCalledWith({ action: "increment", amountMs: 60000 });
  await user.selectOptions(screen.getByLabelText("Adjustment"), "decrement");
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  expect(onApply).toHaveBeenLastCalledWith({ action: "decrement", amountMs: 60000 });
  await user.selectOptions(screen.getByLabelText("Adjustment"), "set");
  await user.clear(screen.getByLabelText("Time (seconds)"));
  expect(screen.getByRole("button", { name: "Apply adjustment" })).toBeDisabled();
  await user.type(screen.getByLabelText("Time (seconds)"), "0");
  await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
  expect(onApply).toHaveBeenLastCalledWith({ action: "set", amountMs: 0 });
});
