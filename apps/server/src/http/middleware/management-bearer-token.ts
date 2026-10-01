export function extractBearerToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^Bearer\s/i.test(trimmed)) {
    return null;
  }

  // Separate the whitespace scan from token validation so malformed multiline
  // input cannot backtrack between two overlapping variable-length matches.
  const token = trimmed.slice(6).trimStart();
  return token.length > 0 && !/[\r\n\u2028\u2029]/.test(token) ? token : null;
}
