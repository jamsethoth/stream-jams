export function extractBearerToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}
