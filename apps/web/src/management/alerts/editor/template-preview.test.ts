import { DefaultTemplateRenderer } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAlertTemplatePreview } from "./template-preview.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderAlertTemplatePreview", () => {
  it("delegates nested placeholder interpolation to DefaultTemplateRenderer without HTML escaping", () => {
    const render = vi.spyOn(DefaultTemplateRenderer.prototype, "render");
    const values = { actor: { displayName: "<Viewer>" } };

    expect(renderAlertTemplatePreview("Welcome {actor.displayName}!", values)).toBe("Welcome <Viewer>!");
    expect(render).toHaveBeenCalledWith({
      template: "Welcome {actor.displayName}!",
      values,
      escapeHtml: false
    });
  });

  it("renders missing and object values as empty text", () => {
    expect(renderAlertTemplatePreview("{actor} / {missing} / {actor.profile}", {
      actor: { displayName: "Viewer", profile: { color: "green" } }
    })).toBe(" /  / ");
  });
});
