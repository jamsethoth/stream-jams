/** Public sources are a bounded inventory; historical/private vocabulary stays readable. */
export function isOrdinaryOverlayOutput(input: {
  readonly scope: unknown;
  readonly purpose: unknown;
  readonly moduleId: unknown;
  readonly targetProfileId?: unknown;
}, allowLegacyProfileless = false): boolean {
  if (input.scope !== "module" || input.purpose !== "live") return false;
  const profile = input.targetProfileId ?? null;
  if (input.moduleId === "alerts" || input.moduleId === "music" || input.moduleId === "timers") {
    return profile === "landscape" || profile === "vertical" || (allowLegacyProfileless && profile === null);
  }
  return (input.moduleId === "videos" || input.moduleId === "screen-effects") && profile === null;
}
