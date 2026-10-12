import type { DataFormat } from "./types.js";
import { dataFormatSchema } from "./schemas.js";

/** Literal text for React/textContent consumers; never interpreted as HTML. */
export function formatDataContent(content: string | number | boolean, format: DataFormat): string {
  dataFormatSchema.parse(format);
  if (typeof content === "number" && !Number.isFinite(content)) throw new RangeError("Cannot format non-finite content");
  const raw = String(content);
  let formatted = raw;
  if (typeof content === "number" && format.thousandsSeparator) {
    const start = raw.startsWith("-") ? 1 : 0;
    let end = start;
    while (end < raw.length && raw.charCodeAt(end) >= 48 && raw.charCodeAt(end) <= 57) end++;
    formatted = raw.slice(0, start);
    for (let index = start; index < end; index++) {
      if (index > start && (end - index) % 3 === 0) formatted += ",";
      formatted += raw[index];
    }
    formatted += raw.slice(end);
  }
  return format.prefix + formatted + format.suffix;
}
