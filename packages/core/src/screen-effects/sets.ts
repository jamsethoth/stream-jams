import { z } from "zod";
import type { ScreenEffectDocument } from "./types.js";

export const screenEffectSetInputSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u),
  name: z.string().trim().min(1).max(120)
}).strict();

export const screenEffectSetSchema = screenEffectSetInputSchema.extend({
  active: z.boolean(),
  effectIds: z.array(z.string())
});

export type ScreenEffectSet = z.infer<typeof screenEffectSetSchema>;
export type ScreenEffectSetInput = z.infer<typeof screenEffectSetInputSchema>;

export interface ScreenEffectSetRepository {
  list(): Promise<readonly ScreenEffectSet[]>;
  create(input: ScreenEffectSetInput, sourceId?: string): Promise<ScreenEffectSet>;
  rename(id: string, name: string): Promise<ScreenEffectSet>;
  activate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  createEffect(document: ScreenEffectDocument, setId: string): Promise<void>;
}

export class ScreenEffectSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenEffectSetError";
  }
}
