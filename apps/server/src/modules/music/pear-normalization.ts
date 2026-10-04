import { musicLimits, musicSnapshotSchema, type MusicSnapshot } from "@stream-jams/core";

export interface PearObservationContext {
  readonly providerId: string;
  readonly generation: string;
  readonly revision: number;
  readonly observedAtEpochMs: number;
  /** Opaque reference returned by the private artwork service, never an upstream URL. */
  readonly artworkRef?: string | null;
}

export interface PrivateArtworkDescriptor { readonly url: string; }

type PearEvent = "PLAYER_INFO" | "VIDEO_CHANGED" | "PLAYER_STATE_CHANGED" | "POSITION_CHANGED" | "REST_SONG" | "REST_EMPTY";
const eventTypes = new Set<PearEvent>(["PLAYER_INFO", "VIDEO_CHANGED", "PLAYER_STATE_CHANGED", "POSITION_CHANGED", "REST_SONG", "REST_EMPTY"]);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Pear observation");
  return value as Record<string, unknown>;
}

function stringField(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid Pear metadata");
  return value;
}

function secondsToMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 1_000) {
    throw new Error("Invalid Pear time");
  }
  return value * 1_000;
}

export function extractPearArtworkDescriptor(songInput: unknown): PrivateArtworkDescriptor | null {
  if (typeof songInput !== "object" || songInput === null || Array.isArray(songInput)) return null;
  const imageSrc = (songInput as Record<string, unknown>).imageSrc;
  if (typeof imageSrc !== "string" || imageSrc.length > 4096) return null;
  try {
    const url = new URL(imageSrc);
    if (url.protocol !== "https:" || url.username || url.password || !["i.ytimg.com", "lh3.googleusercontent.com"].includes(url.hostname.toLowerCase())) return null;
    return { url: url.toString() };
  }
  // error-provenance: allow expected -- malformed provider artwork URLs are omitted from normalized state
  catch { return null; }
}

export function normalizePearObservation(input: unknown, previous: MusicSnapshot | null, context: PearObservationContext): MusicSnapshot {
  const observation = record(input);
  const type = observation.type;
  if (typeof type !== "string" || !eventTypes.has(type as PearEvent)) throw new Error("Unsupported Pear event");
  const event = type as PearEvent;
  let track = previous?.track ?? null;
  let durationMs = previous?.durationMs ?? null;
  let positionMs = previous?.positionMs ?? null;
  let playbackState = previous?.playbackState ?? "unknown";

  if (event === "REST_EMPTY" || ((event === "PLAYER_INFO" || event === "REST_SONG") && observation.song == null)) {
    track = null; durationMs = null; positionMs = null; playbackState = "stopped";
  } else if (event === "VIDEO_CHANGED" || event === "PLAYER_INFO" || event === "REST_SONG") {
    const song = record(observation.song);
    const id = stringField(song.videoId, musicLimits.identityCharacters);
    const sameTrack = previous?.track?.id === id;
    const title = song.title === undefined
      ? (sameTrack ? previous!.track!.title : "")
      : stringField(song.title, musicLimits.metadataCharacters);
    const artistInput = song.artist;
    const artists = artistInput === undefined ? (sameTrack ? previous!.track!.artists : [])
      : Array.isArray(artistInput) ? artistInput.map(value => stringField(value, musicLimits.metadataCharacters))
      : [stringField(artistInput, musicLimits.metadataCharacters)];
    if (artists.length > musicLimits.artists) throw new Error("Too many Pear artists");
    track = {
      id, title, artists,
      album: song.album === undefined ? (sameTrack ? previous!.track!.album : null)
        : song.album === null ? null : stringField(song.album, musicLimits.metadataCharacters),
      artworkRef: context.artworkRef === undefined ? (sameTrack ? previous!.track!.artworkRef : null) : context.artworkRef
    };
    durationMs = song.songDuration === undefined ? (sameTrack ? previous.durationMs : null) : secondsToMs(song.songDuration);
    positionMs = event === "VIDEO_CHANGED" ? 0 : observation.position !== undefined ? secondsToMs(observation.position)
      : song.elapsedSeconds !== undefined ? secondsToMs(song.elapsedSeconds) : (sameTrack ? previous.positionMs : null);
    if (song.isPaused !== undefined) {
      if (typeof song.isPaused !== "boolean") throw new Error("Invalid Pear pause state");
      playbackState = song.isPaused ? "paused" : "playing";
    }
    else if (!sameTrack) playbackState = "unknown";
  }
  if (observation.isPlaying !== undefined) {
    if (typeof observation.isPlaying !== "boolean") throw new Error("Invalid Pear playback state");
    playbackState = observation.isPlaying ? "playing" : "paused";
  }
  if ((event === "POSITION_CHANGED" || event === "PLAYER_STATE_CHANGED") && observation.position !== undefined) positionMs = secondsToMs(observation.position);
  return musicSnapshotSchema.parse({
    providerId: context.providerId, generation: context.generation, revision: context.revision,
    track, playbackState, positionMs, durationMs, observedAtEpochMs: context.observedAtEpochMs, session: null
  });
}
