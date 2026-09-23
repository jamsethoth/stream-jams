import type { OverlayPurpose } from "@stream-jams/core";

export function readModuleOverlayParams(params: unknown): {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly moduleId?: unknown;
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    moduleId: typeof candidate.moduleId === "string" ? candidate.moduleId : "",
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

export function readUnifiedOverlayParams(params: unknown): {
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

export function parseOverlayPurpose(value: unknown): OverlayPurpose | null {
  return value === "live" || value === "test" ? value : null;
}
