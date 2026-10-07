import { renderManagement as render } from "../../test-support/render-management.js";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { TimerEventRule } from "@stream-jams/core";
import { TimerEventRulesEditor } from "./TimerEventRulesEditor.js";

it("authors a reward rule and offers inactive alternatives for adjustments", async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  function Harness() { const [rules, setRules] = useState<readonly TimerEventRule[]>([]); return <TimerEventRulesEditor rules={rules} onChange={next => { changed(next); setRules(next); }} />; }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Add event rule" }));
  await user.type(screen.getByLabelText("Reward ID (optional)"), "cat-paws");
  await user.selectOptions(screen.getByLabelText("Action"), "increment");
  expect(screen.getByLabelText("When timer is inactive")).toHaveValue("ignore");
  await user.selectOptions(screen.getByLabelText("When timer is inactive"), "paused");
  expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ rewardId: "cat-paws", action: "increment", inactiveBehavior: "paused" })]);
  await user.click(screen.getByRole("button", { name: "Remove rule 1" }));
  expect(screen.getByText("No event rules configured.")).toBeVisible();
});
