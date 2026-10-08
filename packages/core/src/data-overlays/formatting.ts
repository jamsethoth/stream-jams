import type { DataFormat } from "./types.js";
import { dataFormatSchema } from "./schemas.js";

/** Literal text for React/textContent consumers; never interpreted as HTML. */
export function formatDataContent(content: string | number | boolean, format: DataFormat): string {
  dataFormatSchema.parse(format);
  if (typeof content === "number" && !Number.isFinite(content)) throw new RangeError("Cannot format non-finite content");
  const raw = String(content);
  const formatted = typeof content === "number" && format.thousandsSeparator
    ? raw.replace(/^(-?\d+)(.*)$/, (_match, integer: string, remainder: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + remainder)
    : raw;
  return format.prefix + formatted + format.suffix;
}
