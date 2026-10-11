import { z } from "zod";
import { rgbaColorSchema } from "../alerts/text-style.js";
import { isoDateTimeSchema, overlayTargetProfileIdSchema } from "../shared/schemas.js";
import { dataOverlayLimits } from "./limits.js";

export const dataIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u);
export const dataNameSchema = z.string().trim().min(1).max(dataOverlayLimits.nameCharacters);
export const dataIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const dataTextSchema = z.string().refine(value => new TextEncoder().encode(value).byteLength <= dataOverlayLimits.textBytes, "Text exceeds 2 KiB UTF-8");
const revision = dataIntegerSchema.nonnegative();
const valueDefinition = { name: dataNameSchema, resetGroupId: dataIdSchema.nullable() };
export const dataValueCreateInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...valueDefinition, kind: z.literal("integer"), resetDefault: dataIntegerSchema }).strict(),
  z.object({ ...valueDefinition, kind: z.literal("text"), resetDefault: dataTextSchema }).strict()
]);
// Kind and live content deliberately cannot be edited through definition updates.
export const dataValueUpdateInputSchema = z.object({ name: dataNameSchema.optional(), resetGroupId: dataIdSchema.nullable().optional(), resetDefault: z.union([dataIntegerSchema, dataTextSchema]).optional() }).strict();
export const dataValueSetInputSchema = z.object({ content: z.union([dataIntegerSchema, dataTextSchema]), expectedRevision: revision }).strict();
export const dataValueDeltaInputSchema = z.object({ amount: dataIntegerSchema.positive() }).strict();
export const dataValueSourceSchema = z.object({ provider: z.literal("twitch"), kind: z.literal("follower-total"), broadcasterId: dataIdSchema, invalidated: z.literal(true).optional() }).strict();
export const twitchFollowerSourceInputSchema = z.object({ name: dataNameSchema }).strict();
export const twitchDataSourceStatusSchema = z.object({
  follower: z.object({ state: z.enum(["unconfigured", "current", "stale", "invalid", "disconnected"]), broadcasterId: dataIdSchema.nullable(), valueIds: z.array(dataIdSchema), updatedAt: isoDateTimeSchema.nullable() }).strict(),
  goals: z.object({ state: z.enum(["integration-pending", "reauthorization-required", "disconnected"]), missingScopes: z.array(z.string()) }).strict()
}).strict();
const valueDocument = { ...valueDefinition, id: dataIdSchema, revision, createdAt: isoDateTimeSchema, updatedAt: isoDateTimeSchema, source: dataValueSourceSchema.optional() };
export const dataValueSchema = z.discriminatedUnion("kind", [
  z.object({ ...valueDocument, kind: z.literal("integer"), content: dataIntegerSchema, resetDefault: dataIntegerSchema }).strict(),
  z.object({ ...valueDocument, kind: z.literal("text"), content: dataTextSchema, resetDefault: dataTextSchema }).strict()
]).superRefine((value, context) => {
  if (value.source && (value.kind !== "integer" || value.resetGroupId !== null || value.content < 0 || value.resetDefault !== 0)) context.addIssue({ code: "custom", path: ["source"], message: "Follower sources require a nonnegative integer and no reset membership" });
});
const goalDefinition = { name: dataNameSchema, valueId: dataIdSchema };
const goalVariants = [
  z.object({ ...goalDefinition, mode: z.literal("fixed-target"), target: dataIntegerSchema.positive() }).strict(),
  z.object({ ...goalDefinition, mode: z.literal("saved-baseline"), baseline: dataIntegerSchema, additionalAmount: dataIntegerSchema.positive() }).strict()
] as const;
export const dataGoalInputSchema = z.discriminatedUnion("mode", goalVariants).refine(goal => goal.mode === "fixed-target" || Number.isSafeInteger(goal.baseline + goal.additionalAmount), "Goal target exceeds safe integer range");
export const dataGoalSchema = z.discriminatedUnion("mode", [goalVariants[0].extend({ id: dataIdSchema }), goalVariants[1].extend({ id: dataIdSchema })]).refine(goal => goal.mode === "fixed-target" || Number.isSafeInteger(Number(goal.baseline) + Number(goal.additionalAmount)), "Goal target exceeds safe integer range");
export const dataResetGroupInputSchema = z.object({ name: dataNameSchema }).strict();
export const dataResetGroupSchema = dataResetGroupInputSchema.extend({ id: dataIdSchema });
export const dataGoalFieldSchema = z.enum(["current", "baseline", "target", "achieved", "remaining", "percentage", "completed", "fill"]);
export const dataBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), valueId: dataIdSchema }).strict(),
  z.object({ kind: z.literal("goal"), goalId: dataIdSchema, field: dataGoalFieldSchema }).strict()
]);
export const dataFormatSchema = z.object({ thousandsSeparator: z.boolean(), prefix: dataTextSchema, suffix: dataTextSchema, overflow: z.enum(["wrap", "ellipsis"]) }).strict();
export const dataTextStyleSchema = z.object({ fontSizePx: z.number().int().min(dataOverlayLimits.fontSizePx.min).max(dataOverlayLimits.fontSizePx.max), color: rgbaColorSchema, fontWeight: z.number().int().min(100).max(900).multipleOf(100), align: z.enum(["left", "center", "right"]) }).strict();
const elementBase = { id: dataIdSchema, order: dataIntegerSchema, x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive(), visible: z.boolean(), stalePolicy: z.enum(["retain-last", "hide-immediately"]).default("retain-last") };
export const dataCanvasElementSchema = z.discriminatedUnion("kind", [
  z.object({ ...elementBase, kind: z.literal("text"), binding: dataBindingSchema.nullable(), literalText: dataTextSchema.default(""), format: dataFormatSchema, style: dataTextStyleSchema }).strict(),
  z.object({ ...elementBase, kind: z.literal("image"), assetId: dataIdSchema, fit: z.enum(["contain", "cover", "fill"]) }).strict(),
  z.object({ ...elementBase, kind: z.literal("missing-image"), sourceAssetId: dataIdSchema, fit: z.enum(["contain", "cover", "fill"]) }).strict(),
  z.object({ ...elementBase, kind: z.enum(["rectangle", "ellipse"]), color: rgbaColorSchema }).strict(),
  z.object({ ...elementBase, kind: z.literal("progress"), goalId: dataIdSchema, orientation: z.enum(["horizontal", "vertical"]), direction: z.enum(["forward", "reverse"]), fillColor: rgbaColorSchema, backgroundColor: rgbaColorSchema, borderColor: rgbaColorSchema, borderWidthPx: z.number().finite().min(0).max(dataOverlayLimits.borderWidthPx) }).strict()
]);
const canvasDefinition = { name: dataNameSchema, enabled: z.boolean(), order: dataIntegerSchema, targetProfileId: overlayTargetProfileIdSchema, outputs: z.object({ browser: z.boolean(), desktop: z.boolean() }).strict(), elements: z.array(dataCanvasElementSchema).max(dataOverlayLimits.elementsPerCanvas) };
function checkCanvas(canvas: z.infer<typeof dataCanvasInputBase>, context: z.RefinementCtx) {
  const width = canvas.targetProfileId === "landscape" ? 1920 : 1080;
  const height = canvas.targetProfileId === "landscape" ? 1080 : 1920;
  const ids = new Set<string>();
  canvas.elements.forEach((element, index) => {
    if (ids.has(element.id)) context.addIssue({ code: "custom", path: ["elements", index, "id"], message: "Duplicate element ID" });
    ids.add(element.id);
    if (element.x + element.width > width || element.y + element.height > height) context.addIssue({ code: "custom", path: ["elements", index], message: "Element must fit inside target profile" });
    if (element.kind === "progress" && element.borderWidthPx * 2 > Math.min(element.width, element.height)) context.addIssue({ code: "custom", path: ["elements", index, "borderWidthPx"], message: "Border must fit the bar" });
  });
}
const dataCanvasInputBase = z.object(canvasDefinition).strict();
export const dataCanvasInputSchema = dataCanvasInputBase.superRefine(checkCanvas);
export const dataCanvasSchema = dataCanvasInputBase.extend({ id: dataIdSchema }).superRefine(checkCanvas);
export const dataOverlaysModuleConfigSchema = z.object({}).strict();
export const dataOverlayStateSchema = z.object({ revision, values: z.array(dataValueSchema).max(dataOverlayLimits.values), goals: z.array(dataGoalSchema).max(dataOverlayLimits.goals), resetGroups: z.array(dataResetGroupSchema).max(dataOverlayLimits.values), pinnedValueIds: z.array(dataIdSchema).max(dataOverlayLimits.values), canvases: z.array(dataCanvasSchema).max(dataOverlayLimits.canvases) }).strict().superRefine((state, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  for (const key of ["values", "goals", "resetGroups", "canvases"] as const) {
    const ids = new Set<string>();
    state[key].forEach((item, index) => { if (ids.has(item.id)) issue([key, index, "id"], "Duplicate ID"); ids.add(item.id); });
  }
  const values = new Map(state.values.map(value => [value.id, value]));
  const goals = new Set(state.goals.map(goal => goal.id));
  const groups = new Set(state.resetGroups.map(group => group.id));
  state.values.forEach((value, index) => {
    if (value.resetGroupId !== null && !groups.has(value.resetGroupId)) issue(["values", index, "resetGroupId"], "Missing reset group");
    if (value.source && (value.kind !== "integer" || value.resetGroupId !== null)) issue(["values", index, "source"], "Follower sources require an integer without reset membership");
  });
  state.goals.forEach((goal, index) => { if (values.get(goal.valueId)?.kind !== "integer") issue(["goals", index, "valueId"], "Goals require an integer value"); });
  const pins = new Set<string>();
  state.pinnedValueIds.forEach((id, index) => { if (!values.has(id) || pins.has(id)) issue(["pinnedValueIds", index], "Missing or duplicate value pin"); pins.add(id); });
  state.canvases.forEach((canvas, ci) => canvas.elements.forEach((element, ei) => {
    const binding = element.kind === "text" ? element.binding : element.kind === "progress" ? { kind: "goal" as const, goalId: element.goalId } : null;
    if (binding && (binding.kind === "value" ? !values.has(binding.valueId) : !goals.has(binding.goalId))) issue(["canvases", ci, "elements", ei], "Missing binding");
  }));
});


export const dataSourceStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("current") }).strict(),
  z.object({ state: z.literal("stale"), staleSinceEpochMs: z.number().finite().nonnegative() }).strict(),
  z.object({ state: z.enum(["ended", "invalid"]) }).strict()
]);
export { dataProjectedElementSchema, dataCanvasProjectionSchema, dataOverlayProjectionSchema } from "./projection-schemas.js";
