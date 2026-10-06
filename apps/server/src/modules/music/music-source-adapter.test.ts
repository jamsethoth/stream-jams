import { expectTypeOf, it } from "vitest";
import type { MusicSourceAdapter } from "@stream-jams/core";
import type { MusicArtworkCapability, MusicRuntimeSourceAdapter } from "./music-source-adapter.js";

it("requires an explicit artwork absence or a complete, correctly typed capability", () => {
  expectTypeOf<MusicSourceAdapter & { artwork: null }>().toExtend<MusicRuntimeSourceAdapter>();
  expectTypeOf<MusicSourceAdapter & { artwork: MusicArtworkCapability }>().toExtend<MusicRuntimeSourceAdapter>();
  expectTypeOf<MusicSourceAdapter>().not.toExtend<MusicRuntimeSourceAdapter>();
  expectTypeOf<Pick<MusicArtworkCapability, "getArtworkPolicy">>().not.toExtend<MusicArtworkCapability>();
  expectTypeOf<{ getArtworkPolicy(): string; getArtworkDescriptor(): null }>().not.toExtend<MusicArtworkCapability>();
});
