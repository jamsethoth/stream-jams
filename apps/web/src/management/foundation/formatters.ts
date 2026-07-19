type DateValue = Date | number | string;

type CountLabels = Readonly<{
  one: string;
  other: string;
}>;

function resolveLocale(locale?: string): string {
  if (locale) return locale;

  if (typeof document !== "undefined" && document.documentElement.lang) {
    return document.documentElement.lang;
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "en";
}

function validDate(value: DateValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: DateValue, locale?: string): string {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat(resolveLocale(locale), {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date)
    : "Invalid date";
}

export function formatDate(value: DateValue, locale?: string): string {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat(resolveLocale(locale), { dateStyle: "medium" }).format(date)
    : "Invalid date";
}

export function formatBytes(bytes: number, locale?: string): string {
  let value = bytes;
  let unit = "B";

  if (bytes >= 1024 * 1024) {
    value = bytes / (1024 * 1024);
    unit = "MiB";
  } else if (bytes >= 1024) {
    value = bytes / 1024;
    unit = "KiB";
  }

  const formattedValue = new Intl.NumberFormat(resolveLocale(locale), {
    maximumFractionDigits: unit === "B" ? 0 : 1
  }).format(value);
  return `${formattedValue} ${unit}`;
}

export function formatCount(value: number, labels: CountLabels, locale?: string): string {
  const resolvedLocale = resolveLocale(locale);
  const label = new Intl.PluralRules(resolvedLocale).select(value) === "one"
    ? labels.one
    : labels.other;
  return `${new Intl.NumberFormat(resolvedLocale).format(value)} ${label}`;
}

export function formatHours(hours: number, locale?: string): string {
  if (hours >= 24 && hours % 24 === 0) {
    return formatCount(hours / 24, { one: "day", other: "days" }, locale);
  }

  return formatCount(hours, { one: "hour", other: "hours" }, locale);
}
