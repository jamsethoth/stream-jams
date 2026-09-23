import { readOwnPath } from "../internal/read-own-path.js";

export interface RenderTemplateInput {
  readonly template: string;
  readonly values: unknown;
  readonly escapeHtml?: boolean;
}

export interface TemplateRenderer {
  render(input: RenderTemplateInput): string;
}

export class DefaultTemplateRenderer implements TemplateRenderer {
  render(input: RenderTemplateInput): string {
    const shouldEscape = input.escapeHtml ?? true;

    return input.template.replace(/\{([^{}]+)\}/g, (_match, rawPath: string) => {
      const value = readOwnPath(input.values, rawPath.trim());
      const text = formatTemplateValue(value);
      return shouldEscape ? escapeHtml(text) : text;
    });
  }
}

function formatTemplateValue(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return "";
  }

  return String(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character);
}

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};
