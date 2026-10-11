import { renderManagement as render } from "../../test-support/render-management.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { TimerEventRule } from "@stream-jams/core";
import { TimerEventRulesEditor } from "./TimerEventRulesEditor.js";

afterEach(cleanup);

it("authors a reward rule and offers inactive alternatives for adjustments", async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  function Harness() { const [rules, setRules] = useState<readonly TimerEventRule[]>([]); return <TimerEventRulesEditor rules={rules} onChange={next => { changed(next); setRules(next); }} />; }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Add event rule" }));
  await user.type(screen.getByLabelText("Reward ID (optional)"), "cat-paws");
  await user.selectOptions(screen.getByLabelText("Action"), "increment");
  expect(screen.getByLabelText("When timer is inactive")).toHaveValue("ignore");
  await user.selectOptions(screen.getByLabelText("When timer is inactive"), "paused");
  expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({
    selector: { match: { kind: "canonical", type: "channel_point_redemption" }, sources: "any", conditions: [{ field: "channelPointReward", operator: "equals", value: "cat-paws" }] },
    action: "increment",
    inactiveBehavior: "paused"
  })]);
  await user.click(screen.getByRole("button", { name: "Remove rule 1" }));
  expect(screen.getByText("No event rules configured.")).toBeVisible();
});

it("maps source, tier and event type changes onto the rule selector", async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  function Harness() { const [rules, setRules] = useState<readonly TimerEventRule[]>([]); return <TimerEventRulesEditor rules={rules} onChange={next => { changed(next); setRules(next); }} />; }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Add event rule" }));
  await user.type(screen.getByLabelText("Reward ID (optional)"), "cat-paws");
  await user.selectOptions(screen.getByLabelText("Event source"), "streamerbot");
  await user.selectOptions(screen.getByLabelText("Event type"), "subscription");
  expect(screen.queryByLabelText("Reward ID (optional)")).toBeNull();
  await user.selectOptions(screen.getByLabelText("Subscription tier"), "3000");
  expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({
    selector: { match: { kind: "canonical", type: "subscription" }, sources: ["streamerbot"], conditions: [{ field: "tier", operator: "equals", value: "3000" }] }
  })]);
  await user.selectOptions(screen.getByLabelText("Event source"), "any");
  expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ selector: expect.objectContaining({ sources: "any" }) })]);
});

it("keeps conditions the editor does not own and shows non-canonical triggers read-only", () => {
  const rules: readonly TimerEventRule[] = [
    { enabled: true, selector: { match: { kind: "canonical", type: "cheer" }, sources: "any", conditions: [{ field: "amount", operator: "min", value: 100 }] }, action: "start", amountMs: 0, quantityUnit: null, inactiveBehavior: "ignore" },
    { enabled: true, selector: { match: { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" }, sources: "any", conditions: [] }, action: "stop", amountMs: 0, quantityUnit: null, inactiveBehavior: "ignore" }
  ];
  render(<TimerEventRulesEditor rules={rules} onChange={() => {}} />);
  expect(screen.getAllByLabelText("Event type")).toHaveLength(1);
  expect(screen.getByText("Trigger: Streamer.bot OBS SceneChanged")).toBeVisible();
});
