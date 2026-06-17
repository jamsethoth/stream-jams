import { z } from "zod";
import { isoDateTimeSchema, nonEmptyStringSchema, nonNegativeIntegerSchema } from "../shared/schemas.js";

export const overlayModuleWizardFieldSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  type: z.enum(["text", "number", "boolean"]),
  required: z.boolean()
});

export const overlayModuleWizardStepSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  fields: z.array(overlayModuleWizardFieldSchema)
});

export const overlayModuleWizardDefinitionSchema = z.object({
  steps: z.array(overlayModuleWizardStepSchema).min(1)
});

export const overlayModuleRendererDefinitionSchema = z.object({
  entryPoint: nonEmptyStringSchema,
  supportedOutputs: z.array(z.enum(["module", "unified"])).min(1)
});

export const overlayModuleDefinitionSchema = z.object({
  id: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  defaultEnabled: z.boolean(),
  configSchemaVersion: nonNegativeIntegerSchema,
  defaultConfig: z.unknown(),
  configSchema: z.unknown().optional(),
  wizard: overlayModuleWizardDefinitionSchema,
  renderer: overlayModuleRendererDefinitionSchema
});

export const overlayModuleConfigSchema = z.object({
  moduleId: nonEmptyStringSchema,
  enabled: z.boolean(),
  config: z.unknown(),
  updatedAt: isoDateTimeSchema
});
