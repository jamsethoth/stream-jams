import type { z } from "zod";
import type * as schemas from "./schemas.js";
export type DataValue = z.infer<typeof schemas.dataValueSchema>;
export type TwitchDataSourceStatus = z.infer<typeof schemas.twitchDataSourceStatusSchema>;
export type TwitchFollowerSourceInput = z.infer<typeof schemas.twitchFollowerSourceInputSchema>;
export type DataGoal = z.infer<typeof schemas.dataGoalSchema>;
export type DataResetGroup = z.infer<typeof schemas.dataResetGroupSchema>;
export type DataCanvas = z.infer<typeof schemas.dataCanvasSchema>;
export type DataCanvasElement = z.infer<typeof schemas.dataCanvasElementSchema>;
export type DataOverlayState = z.infer<typeof schemas.dataOverlayStateSchema>;
export type DataFormat = z.infer<typeof schemas.dataFormatSchema>;
export type DataValueCreateInput = z.infer<typeof schemas.dataValueCreateInputSchema>;
export type DataValueUpdateInput = z.infer<typeof schemas.dataValueUpdateInputSchema>;
export type DataValueSetInput = z.infer<typeof schemas.dataValueSetInputSchema>;
export type DataValueDeltaInput = z.infer<typeof schemas.dataValueDeltaInputSchema>;
export type DataGoalInput = z.infer<typeof schemas.dataGoalInputSchema>;
export type DataResetGroupInput = z.infer<typeof schemas.dataResetGroupInputSchema>;
export type DataCanvasInput = z.infer<typeof schemas.dataCanvasInputSchema>;
export type DataGoalProjection = { current: number; baseline: number; target: number; achieved: number; remaining: number; percentage: number; completed: boolean; fill: number };
export type DataSourceStatus = { state: "current" } | { state: "stale"; staleSinceEpochMs: number } | { state: "ended" | "invalid" };
export interface DataProjectionOptions {
  runtimeId: string;
  output: "browser" | "desktop";
  targetProfileId: "landscape" | "vertical";
  nowEpochMs: number;
  moduleEnabled: boolean;
  outputPaused: boolean;
  /** Presence means provider-backed. Omitted values are manual and never stale. */
  sourceStatuses?: Readonly<Record<string, DataSourceStatus>>;
  /** Resolves registered local image IDs. Return false for unavailable/non-image assets. */
  resolveAssetId: (assetId: string) => boolean;
}
export type DataProjectedGeometry = Pick<DataCanvasElement, "id" | "order" | "x" | "y" | "width" | "height">;
export type DataProjectedElement = DataProjectedGeometry & (
  { kind: "text"; text: string; overflow: "wrap" | "ellipsis"; style: z.infer<typeof schemas.dataTextStyleSchema> } |
  { kind: "image"; assetId: string; fit: "contain" | "cover" | "fill" } |
  { kind: "rectangle" | "ellipse"; color: string } |
  { kind: "progress"; fill: number; orientation: "horizontal" | "vertical"; direction: "forward" | "reverse"; fillColor: string; backgroundColor: string; borderColor: string; borderWidthPx: number }
);
export interface DataCanvasProjection {
  id: string; order: number; targetProfileId: "landscape" | "vertical";
  elements: DataProjectedElement[];
}
export interface DataOverlayProjection { runtimeId: string; revision: number; canvases: DataCanvasProjection[] }
