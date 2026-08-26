import { DefaultTemplateRenderer } from "@stream-jams/core";

const templateRenderer = new DefaultTemplateRenderer();

export function renderAlertTemplatePreview(template: string, sample: unknown): string {
  return templateRenderer.render({ template, values: sample, escapeHtml: false });
}
