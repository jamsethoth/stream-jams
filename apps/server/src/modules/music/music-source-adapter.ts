import type { MusicSnapshot, MusicSourceAdapter } from "@stream-jams/core";
import type { MusicArtworkPolicy, PrivateArtworkDescriptor } from "./music-artwork-policy.js";

export interface MusicArtworkCapability {
  getArtworkPolicy(): MusicArtworkPolicy;
  getArtworkDescriptor(ref: string, owner: Pick<MusicSnapshot, "providerId" | "generation">): PrivateArtworkDescriptor | null;
}

export interface MusicRuntimeSourceAdapter extends MusicSourceAdapter {
  readonly artwork: MusicArtworkCapability | null;
}
