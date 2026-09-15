import { alertStarterTemplates } from "@stream-jams/core";

const moduleLabels: Readonly<Record<string, string>> = {
  alerts: "Alerts",
  "screen-effects": "Screen Effects"
};

export function formatIdentifierLabel(value: string): string {
  const words = value.split(/[-_]+/u).filter(Boolean);
  if (words.length === 0) return value;
  return words.map((word, index) => index === 0
    ? `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    : word.toLocaleLowerCase()).join(" ");
}

export function formatEventLabel(value: string): string {
  return alertStarterTemplates.find((template) => template.eventType === value)?.label ?? formatIdentifierLabel(value);
}

export function formatModuleLabel(value: string): string {
  return moduleLabels[value] ?? formatIdentifierLabel(value);
}
