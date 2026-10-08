import { z } from "zod";
import { overlayTargetProfileIdSchema } from "../shared/schemas.js";
import { dataCanvasInputSchema, dataCanvasElementSchema, dataIdSchema, dataIntegerSchema, dataNameSchema, dataValueCreateInputSchema } from "./schemas.js";

export const dataTemplateLimits = { userTemplates: 100, slots: 100 } as const;
const requirement = z.object({ provider: z.literal("twitch"), kind: z.literal("follower-total") }).strict();
const slot = { id: dataIdSchema, name: dataNameSchema, requiredSource: requirement.optional() };
export const dataTemplateSlotSchema = z.discriminatedUnion("kind", [
  z.object({ ...slot, kind: z.literal("value"), valueKind: z.enum(["integer", "text"]) }).strict(),
  z.object({ ...slot, kind: z.literal("goal") }).strict()
]).refine(s => !s.requiredSource || s.kind === "goal" || s.valueKind === "integer", "Follower slots require integers");
export const dataTemplateSchema = z.object({ id: dataIdSchema, origin: z.enum(["bundled", "user"]), schemaVersion: z.literal(1), name: dataNameSchema,
  targetProfileId: overlayTargetProfileIdSchema, elements: z.array(dataCanvasElementSchema).max(100), slots: z.array(dataTemplateSlotSchema).max(dataTemplateLimits.slots)
}).strict().superRefine((template, context) => {
  const layout = dataCanvasInputSchema.safeParse({ name: template.name, enabled: false, order: 0, targetProfileId: template.targetProfileId, outputs: { browser: false, desktop: false }, elements: template.elements });
  if (!layout.success) for (const issue of layout.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  const slots = new Map(template.slots.map(s => [s.id, s])); const used = new Set<string>();
  if (slots.size !== template.slots.length) context.addIssue({ code: "custom", path: ["slots"], message: "Duplicate slot ID" });
  template.elements.forEach((element, index) => {
    const binding = element.kind === "text" ? element.binding : element.kind === "progress" ? { kind: "goal" as const, goalId: element.goalId } : null;
    if (!binding) return;
    const id = binding.kind === "value" ? binding.valueId : binding.goalId; const found = slots.get(id); used.add(id);
    if (!found || found.kind !== binding.kind) context.addIssue({ code: "custom", path: ["elements", index], message: "Missing or incompatible template slot" });
    if (element.kind === "text" && element.literalText !== "") context.addIssue({ code: "custom", path: ["elements", index, "literalText"], message: "Bound template text cannot store live content" });
  });
  template.slots.forEach((s, index) => { if (!used.has(s.id)) context.addIssue({ code: "custom", path: ["slots", index], message: "Unused template slot" }); });
});
export const dataTemplateCatalogSchema = z.object({ templates: z.array(dataTemplateSchema).max(dataTemplateLimits.userTemplates + 4) }).strict().superRefine((catalog, context) => {
  const ids = new Set<string>(); const userNames = new Set<string>(); let userCount = 0;
  catalog.templates.forEach((t, i) => {
    if (ids.has(t.id)) context.addIssue({ code: "custom", path: ["templates", i, "id"], message: "Duplicate template ID" }); ids.add(t.id);
    if (t.origin === "user") { userCount++; const key = t.name.trim().toLowerCase(); if (userNames.has(key)) context.addIssue({ code: "custom", path: ["templates", i, "name"], message: "Duplicate template name" }); userNames.add(key); }
  });
  if (userCount > dataTemplateLimits.userTemplates) context.addIssue({ code: "custom", path: ["templates"], message: "Too many user templates" });
});
export const dataTemplateSaveInputSchema = z.object({ name: dataNameSchema, canvasId: dataIdSchema, elementIds: z.array(dataIdSchema).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Duplicate selection ID").optional() }).strict();
const integerDefinition = dataValueCreateInputSchema.options[0];
const newGoal = z.discriminatedUnion("mode", [z.object({ name: dataNameSchema, mode: z.literal("fixed-target"), target: dataIntegerSchema.positive() }).strict(), z.object({ name: dataNameSchema, mode: z.literal("saved-baseline"), additionalAmount: dataIntegerSchema.positive() }).strict()]);
export const dataTemplateMappingSchema = z.object({ slotId: dataIdSchema, mapping: z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), valueId: dataIdSchema }).strict(), z.object({ kind: z.literal("goal"), goalId: dataIdSchema }).strict(),
  z.object({ kind: z.literal("new-value"), definition: dataValueCreateInputSchema }).strict(),
  z.object({ kind: z.literal("new-goal"), value: z.discriminatedUnion("kind", [z.object({ kind: z.literal("existing"), valueId: dataIdSchema }).strict(), z.object({ kind: z.literal("new"), definition: integerDefinition }).strict()]), goal: newGoal }).strict()
]) }).strict();
const mappings = z.array(dataTemplateMappingSchema).max(dataTemplateLimits.slots);
export const dataTemplateInstantiateInputSchema = z.object({ name: dataNameSchema, enabled: z.boolean(), order: dataIntegerSchema, outputs: z.object({ browser: z.boolean(), desktop: z.boolean() }).strict(), mappings }).strict();
export const dataTemplateInsertInputSchema = z.object({ canvasId: dataIdSchema, x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), mappings }).strict();
export type DataTemplate = z.infer<typeof dataTemplateSchema>;
export type DataTemplateSlot = z.infer<typeof dataTemplateSlotSchema>;
export type DataTemplateCatalog = z.infer<typeof dataTemplateCatalogSchema>;
export type DataTemplateSaveInput = z.infer<typeof dataTemplateSaveInputSchema>;
export type DataTemplateMapping = z.infer<typeof dataTemplateMappingSchema>;
export type DataTemplateInstantiateInput = z.infer<typeof dataTemplateInstantiateInputSchema>;
export type DataTemplateInsertInput = z.infer<typeof dataTemplateInsertInputSchema>;
