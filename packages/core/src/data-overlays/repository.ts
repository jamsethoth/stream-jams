import type { DataOverlayState } from "./types.js";
/** Mutations read and commit under one synchronous database transaction. */
export interface DataOverlayRepository {
  read(): DataOverlayState;
  mutate(work: (draft: DataOverlayState) => void): DataOverlayState;
}
