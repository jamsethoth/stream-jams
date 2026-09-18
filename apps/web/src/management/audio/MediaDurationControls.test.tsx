import type { AssetLibraryItem } from "@stream-jams/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MediaDurationControls } from "./MediaDurationControls.js";

const asset = (id: string, durationMs: number | null): AssetLibraryItem => ({
  id, displayName: id, originalFileName: `${id}.wav`, mediaType: "audio", mimeType: "audio/wav",
  sizeBytes: 1, width: null, height: null, durationMs, health: "available", tags: [],
  createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
  usage: { assetId: id, totalUsageCount: 0, usages: [] }
});

it("selects the longest known media and explains the result", async () => {
  const user = userEvent.setup(); const onChange = vi.fn();
  render(<MediaDurationControls mode="custom" durationMs={5_000} assets={[asset("short", 2_000), asset("long", 8_000)]}
    assetIds={["short", "long"]} fallbackDurationMs={5_000} onChange={onChange} />);
  await user.click(screen.getByRole("radio", { name: "Match longest media" }));
  expect(onChange).toHaveBeenCalledWith({ mode: "media", durationMs: 8_000 });
});

it("offers bounded repair for legacy media without a duration", async () => {
  const user = userEvent.setup(); const onRepair = vi.fn(async () => {});
  render(<MediaDurationControls mode="media" durationMs={5_000} assets={[asset("legacy", null)]}
    assetIds={["legacy"]} fallbackDurationMs={5_000} onChange={() => {}} onRepair={onRepair} />);
  expect(screen.getByText(/5-second fallback/i)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retry duration" }));
  expect(onRepair).toHaveBeenCalledWith("legacy");
});
