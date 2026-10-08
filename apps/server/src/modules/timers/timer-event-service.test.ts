import { expect, it, vi } from "vitest";
import type { TimerDefinition, TimerEventRule, NormalizedStreamEvent } from "@stream-jams/core";
import { canonicalBusEvent } from "../../test-support/bus-event-fixtures.js";
import { TimerEventService } from "./timer-event-service.js";

it("filters reward IDs and source, applies ordered actions and quantity, and ignores disabled rules", async () => {
  const rule: TimerEventRule = { enabled: true, selector: { match: { kind: "canonical", type: "channel_point_redemption" }, sources: ["twitch"], conditions: [{ field: "channelPointReward", operator: "equals", value: "cat" }] }, action: "start", amountMs: 1000, quantityUnit: null, inactiveBehavior: "ignore" };
  const definitions: TimerDefinition[] = [{ id: "cat", label: "Cat paws", durationMs: 10000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", eventRules: [rule, { ...rule, action: "increment", amountMs: 5000 }, { ...rule, enabled: false, action: "stop" }] }];
  const runtime = { start: vi.fn(), stop: vi.fn(), restart: vi.fn(), adjust: vi.fn() };
  const service = new TimerEventService({ list: () => definitions }, runtime);
  const event: NormalizedStreamEvent = { id: "r1", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: "2026-10-01T00:00:00Z", actor: { id: "u", displayName: "Viewer" }, message: null, metadata: {}, type: "channel_point_redemption", amount: null, rewardId: "other", rewardTitle: "Other", userInput: null };
  await service.handleEvent(canonicalBusEvent(event)); expect(runtime.start).not.toHaveBeenCalled();
  await service.handleEvent(canonicalBusEvent({ ...event, rewardId: "cat", ingestProvider: "streamerbot" })); expect(runtime.start).not.toHaveBeenCalled();
  await service.handleEvent(canonicalBusEvent({ ...event, rewardId: "cat" }));
  expect(runtime.start).toHaveBeenCalledWith("cat");
  expect(runtime.adjust).toHaveBeenCalledWith("cat", { action: "increment", amountMs: 5000 }, "ignore");
  expect(runtime.start.mock.invocationCallOrder[0]).toBeLessThan(runtime.adjust.mock.invocationCallOrder[0]!);
  expect(runtime.stop).not.toHaveBeenCalled();
});
