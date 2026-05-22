import type { OverlayInstruction } from "../overlays/types.js";

export interface OverlayModuleWizardField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean" | "select" | "asset" | "color";
  readonly required: boolean;
}

export interface OverlayModuleWizardStep {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly OverlayModuleWizardField[];
}

export interface OverlayModuleWizardDefinition {
  readonly steps: readonly OverlayModuleWizardStep[];
}

export interface OverlayModuleRendererDefinition {
  readonly entryPoint: string;
  readonly supportedOutputs: ReadonlyArray<"module" | "unified">;
}

export interface OverlayModuleDefinition<TConfig = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly defaultEnabled: boolean;
  readonly configSchemaVersion: number;
  readonly defaultConfig: TConfig;
  readonly wizard: OverlayModuleWizardDefinition;
  readonly renderer: OverlayModuleRendererDefinition;
}

export interface OverlayModuleConfig<TConfig = unknown> {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: TConfig;
  readonly updatedAt: string;
}

export interface OverlayModuleSnapshot {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly instructions: readonly OverlayInstruction[];
}
