import type { ScreenEffectDocument } from "./types.js";

export interface ScreenEffectRepository {
  list(): Promise<readonly ScreenEffectDocument[]>;
  find(id: string): Promise<ScreenEffectDocument | null>;
  save(document: ScreenEffectDocument): Promise<void>;
  remove(id: string): Promise<void>;
}
