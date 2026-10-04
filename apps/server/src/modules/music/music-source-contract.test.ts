import { afterEach, describe, it } from "vitest";
import { assertMusicSourceContract, createDisposableMusicSourceFixture, startPearProtocolFixture, type PearProtocolFixture } from "@stream-jams/test-support";
import { PearMusicSource } from "./pear-music-source.js";

let fixture: PearProtocolFixture | null = null;
afterEach(async () => { await fixture?.close(); fixture = null; });

describe("MusicSourceAdapter contract", () => {
  for (const mode of ["push", "poll", "session"] as const) {
    it(`accepts the disposable ${mode} fixture`, async () => {
      await assertMusicSourceContract(createDisposableMusicSourceFixture(mode));
    });
  }

  it("accepts the authenticated Pear WS adapter", async () => {
    fixture = await startPearProtocolFixture();
    const source = new PearMusicSource({
      config: { baseUrl: fixture.baseUrl, transport: "ws" }, token: "throwaway-token",
      providerId: "provider_1", generation: "generation_1"
    });
    await assertMusicSourceContract({
      adapter: source,
      async emitTrack() { fixture!.send({ type: "VIDEO_CHANGED", song: { videoId: "contract_track", title: "Track", artist: "Artist" }, position: 0 }); },
      async emitEmpty() { fixture!.send({ type: "PLAYER_INFO", song: null, isPlaying: false }); }
    });
  });
});
