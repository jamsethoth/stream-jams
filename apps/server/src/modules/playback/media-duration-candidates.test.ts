import { expect, it } from "vitest";
import { projectMediaDurationCandidates } from "./media-duration-candidates.js";

it("preserves order and labels, skips missing records and retains unknown duration", () => {
  const records = new Map([
    ["one", { originalFileName: "first", mediaType: "audio" as const, durationMs: 30 }],
    ["two", { originalFileName: "second", mediaType: "video" as const, durationMs: null }]
  ]);
  expect(projectMediaDurationCandidates(["two", "missing", "one"], records)).toEqual([
    { assetId: "two", label: "second", mediaType: "video", durationMs: null, eligible: true },
    { assetId: "one", label: "first", mediaType: "audio", durationMs: 30, eligible: true }
  ]);
});
