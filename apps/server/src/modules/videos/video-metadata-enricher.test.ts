import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type VideoSource } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { VideoMetadataEnricher, type VideoMetadataDiagnostic } from "./video-metadata-enricher.js";
import type { VideoMetadataLookupResult } from "./video-metadata-lookup.js";
import { SqliteVideoQueueRepository } from "./video-queue-repository.js";
import { VideoQueueService } from "./video-queue-service.js";

const databases: StreamJamsDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(answer: (source: VideoSource, signal: AbortSignal | undefined) => Promise<VideoMetadataLookupResult>) {
  const database = createInMemoryStreamJamsDatabase();
  database.runMigrations();
  databases.push(database);
  const queue = new VideoQueueService({
    repository: new SqliteVideoQueueRepository(database.connection),
    getConfig: () => ({ ...createDefaultVideosModuleConfig(), maxLengthSeconds: 60 }),
    scheduler: { setTimeout: () => null, clearTimeout: () => {} }
  });
  const lookups: VideoSource[] = [];
  const diagnostics: VideoMetadataDiagnostic[] = [];
  const enricher = new VideoMetadataEnricher({
    lookup: { lookup: (source, signal) => { lookups.push(source); return answer(source, signal); } },
    queue,
    onDiagnostic: entry => diagnostics.push(entry)
  });
  const submit = (source: VideoSource, title: string | null = null) =>
    queue.submit("live", { source, title, requester: "viewer", durationMs: null, autoplay: false, via: "streamerbot" });
  return { queue, enricher, lookups, diagnostics, submit };
}

const youtube: VideoSource = { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 };
const clip: VideoSource = { provider: "twitch-clip", clipSlug: "FunnyClip" };

describe("VideoMetadataEnricher", () => {
  it("applies found details to the queued request", async () => {
    const { queue, enricher, submit, diagnostics } = setup(async () => ({ status: "found", metadata: { title: "Official", channelName: "Rick Astley", durationMs: null } }));
    const item = submit(youtube, "Viewer title");
    await enricher.enrich("live", item);
    expect(queue.view("live").items[0]).toMatchObject({ title: "Viewer title", providerTitle: "Official", channelName: "Rick Astley", durationMs: null, status: "queued" });
    expect(diagnostics).toEqual([]);
  });

  it("holds a Twitch clip whose looked-up length is over the limit", async () => {
    const { queue, enricher, submit } = setup(async () => ({ status: "found", metadata: { title: "Long clip", channelName: "Streamer", durationMs: 75_000 } }));
    const item = submit(clip);
    await enricher.enrich("live", item);
    expect(queue.view("live").items[0]).toMatchObject({ status: "held", holdReason: "over-limit", durationMs: 75_000 });
  });

  it("logs a failed or skipped lookup with bounded facts only and leaves the request as queued", async () => {
    const failed = setup(async () => ({ status: "failed", reason: "http-status", httpStatus: 503 }));
    const item = failed.submit(youtube);
    const revision = failed.queue.view("live").revision;
    await failed.enricher.enrich("live", item);
    expect(failed.queue.view("live").revision).toBe(revision);
    expect(failed.diagnostics).toEqual([{ level: "info", message: "Video details could not be looked up.",
      metadata: { itemId: item.id, purpose: "live", provider: "youtube", outcome: "failed", reason: "http-status", httpStatus: 503 } }]);

    const skipped = setup(async () => ({ status: "skipped", reason: "twitch-not-connected" }));
    const twitch = skipped.submit(clip);
    await skipped.enricher.enrich("live", twitch);
    expect(skipped.diagnostics).toEqual([{ level: "debug", message: "Video details were not looked up.",
      metadata: { itemId: twitch.id, purpose: "live", provider: "twitch-clip", outcome: "skipped", reason: "twitch-not-connected" } }]);
    expect(JSON.stringify([...failed.diagnostics, ...skipped.diagnostics])).not.toMatch(/dQw4w9WgXcQ|FunnyClip|https?:/u);
  });

  it("treats a throwing lookup as a failed one", async () => {
    const { enricher, submit, diagnostics } = setup(async () => { throw new Error("boom https://secret"); });
    await expect(enricher.enrich("live", submit(youtube))).resolves.toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ level: "info", metadata: { reason: "network" } });
    expect(JSON.stringify(diagnostics)).not.toContain("secret");
  });

  it("never looks up direct files or replays that already carry their details", async () => {
    const { enricher, lookups, submit, queue } = setup(async () => ({ status: "found", metadata: { title: "x", channelName: "y", durationMs: 10_000 } }));
    await enricher.enrich("live", submit({ provider: "direct", url: "https://videos.example.com/a.mp4" }));
    const described = { ...submit(youtube), providerTitle: "Known", channelName: "Channel" };
    await enricher.enrich("live", described);
    expect(lookups).toEqual([]);
    expect(queue.view("live").items.every(item => item.providerTitle === null)).toBe(true);
  });

  it("notes details that arrive after the request left the queue", async () => {
    const { queue, enricher, submit, diagnostics } = setup(async () => ({ status: "found", metadata: { title: "Late", channelName: null, durationMs: null } }));
    const item = submit(youtube);
    queue.command("live", queue.view("live").revision, { kind: "remove", itemId: item.id });
    await enricher.enrich("live", item);
    expect(diagnostics).toEqual([{ level: "debug", message: "Video details arrived after the request left the queue.", metadata: { itemId: item.id, purpose: "live", provider: "youtube" } }]);
  });

  it("cancels lookups in flight on dispose and drops their results", async () => {
    let release: (result: VideoMetadataLookupResult) => void = () => {};
    let seen: AbortSignal | undefined;
    const { queue, enricher, submit, diagnostics } = setup((_source, signal) => { seen = signal; return new Promise(resolve => { release = resolve; }); });
    const item = submit(youtube);
    const pending = enricher.enrich("live", item);
    enricher.dispose();
    expect(seen?.aborted).toBe(true);
    release({ status: "found", metadata: { title: "Too late", channelName: null, durationMs: null } });
    await pending;
    expect(queue.view("live").items[0]?.providerTitle).toBeNull();
    expect(diagnostics).toEqual([]);
    await enricher.enrich("live", submit(youtube));
  });
});
