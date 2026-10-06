import { z } from "zod";
import { appServerConfigSchema } from "../config/schemas.js";

export const serverConfigViewSchema = appServerConfigSchema;
export const desktopConfigViewSchema = z.object({ available: z.boolean(), closeToTray: z.boolean() });
export const moderationTargetSettingsViewSchema = z.object({
  maxLength: z.number().int().positive(), blockedTerms: z.array(z.string()).readonly(), stripUrls: z.boolean()
});
export const moderationSettingsViewSchema = z.object({
  renderedText: moderationTargetSettingsViewSchema, ttsText: moderationTargetSettingsViewSchema
});
export type ServerConfigView = z.infer<typeof serverConfigViewSchema>;
export type DesktopConfigView = z.infer<typeof desktopConfigViewSchema>;
export type ModerationTargetSettingsView = z.infer<typeof moderationTargetSettingsViewSchema>;
export type ModerationSettingsView = z.infer<typeof moderationSettingsViewSchema>;

export const overlayOutputKeyResultViewSchema = z.object({
  output: z.object({
    id: z.string(), label: z.string(), purpose: z.enum(["live", "test"]), scope: z.enum(["module", "unified"]),
    moduleId: z.string().nullable(), targetProfileId: z.enum(["landscape", "vertical"]).nullable().optional(),
    overlayId: z.string(), enabled: z.boolean(), keyId: z.string().nullable(), url: z.string().nullable(),
    copyableUrlStatus: z.enum(["available", "create-required", "regenerate-required"])
  }),
  keyId: z.string(), url: z.string()
});
