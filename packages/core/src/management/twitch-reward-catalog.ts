import { z } from "zod";
import { nonEmptyStringSchema, positiveIntegerSchema } from "../shared/schemas.js";

export const twitchCustomRewardSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  prompt: z.string(),
  cost: positiveIntegerSchema,
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/u),
  isUserInputRequired: z.boolean(),
  isEnabled: z.boolean(),
  isPaused: z.boolean(),
  isInStock: z.boolean()
}).strict();

export const twitchCustomRewardCatalogSchema = z.object({
  rewards: z.array(twitchCustomRewardSchema).max(50)
}).strict();

export type TwitchCustomReward = z.infer<typeof twitchCustomRewardSchema>;
export type TwitchCustomRewardCatalog = z.infer<typeof twitchCustomRewardCatalogSchema>;
