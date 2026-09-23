export function readOwnPath(value: unknown, path: string): unknown {
  if (path.length === 0) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || segment.length === 0) {
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    return Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, value);
}
