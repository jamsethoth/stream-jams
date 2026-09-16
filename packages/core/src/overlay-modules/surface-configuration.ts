import { z } from "zod";

// Identity must survive persistence unchanged; do not normalize a saved binding.
const identitySchema = z.string().min(1).refine(value => value === value.trim());
export const surfaceLayerSchema = z.object({
  moduleId: identitySchema,
  visible: z.boolean()
}).strict();

const layersSchema = z.array(surfaceLayerSchema).refine(
  layers => new Set(layers.map(layer => layer.moduleId)).size === layers.length,
  "Surface layers must contain unique module IDs"
);
export const surfaceLayersSchema = layersSchema;

export const surfaceConfigurationSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.literal("desktop:primary"),
    kind: z.literal("desktop"),
    enabled: z.boolean(),
    displayId: identitySchema.nullable(),
    opacity: z.number().finite().min(0).max(1),
    layers: layersSchema
  }).strict(),
  z.object({
    id: identitySchema,
    kind: z.literal("unified-browser"),
    overlayId: identitySchema,
    layers: layersSchema
  }).strict()
]).superRefine((value, context) => {
  if (value.kind === "desktop" && value.enabled && value.displayId === null) {
    context.addIssue({ code: "custom", path: ["displayId"], message: "Enabled desktop output requires an explicit display" });
  }
  if (value.kind === "unified-browser" && value.id !== `unified-browser:${value.overlayId}`) {
    context.addIssue({ code: "custom", path: ["id"], message: "Surface identity must match its output" });
  }
});

export type SurfaceLayer = z.infer<typeof surfaceLayerSchema>;
export type SurfaceConfiguration = z.infer<typeof surfaceConfigurationSchema>;

export interface SurfaceRepository {
  list(): Promise<SurfaceConfiguration[]>;
  save(configuration: SurfaceConfiguration): Promise<void>;
}

function registeredModules(registeredIds: readonly string[]): Set<string> {
  const ids = z.array(identitySchema).parse(registeredIds);
  const known = new Set(ids);
  if (known.size !== ids.length) throw new Error("Registered module IDs must be unique");
  return known;
}

/** Rows are topmost-first. Registry discovery is distinct from a complete user reorder. */
export function reconcileSurfaceLayers(saved: readonly SurfaceLayer[], registeredIds: readonly string[]): SurfaceLayer[] {
  const known = registeredModules(registeredIds);
  const retained = layersSchema.parse(saved).filter(layer => known.has(layer.moduleId));
  const retainedIds = new Set(retained.map(layer => layer.moduleId));
  return [...retained, ...registeredIds.filter(id => !retainedIds.has(id)).map(moduleId => ({ moduleId, visible: false }))];
}

export function validateSurfaceOrder(proposed: readonly SurfaceLayer[], registeredIds: readonly string[]): void {
  const known = registeredModules(registeredIds);
  const layers = layersSchema.parse(proposed);
  if (layers.length !== known.size || layers.some(layer => !known.has(layer.moduleId))) {
    throw new Error("Surface order must include every registered module exactly once");
  }
}
