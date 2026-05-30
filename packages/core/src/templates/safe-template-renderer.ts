import {
  DefaultModerationService,
  type ModerationService,
  type ModerationTarget
} from "../moderation/moderation-service.js";
import { DefaultTemplateRenderer, type RenderTemplateInput, type TemplateRenderer } from "./template-renderer.js";

export interface SafeTemplateRendererDependencies {
  readonly moderationService?: ModerationService | undefined;
  readonly templateRenderer?: TemplateRenderer | undefined;
  readonly target: ModerationTarget;
}

export class SafeTemplateRenderer implements TemplateRenderer {
  readonly #moderationService: ModerationService;
  readonly #templateRenderer: TemplateRenderer;
  readonly #target: ModerationTarget;

  constructor(dependencies: SafeTemplateRendererDependencies) {
    this.#moderationService = dependencies.moderationService ?? new DefaultModerationService();
    this.#templateRenderer = dependencies.templateRenderer ?? new DefaultTemplateRenderer();
    this.#target = dependencies.target;
  }

  render(input: RenderTemplateInput): string {
    return this.#moderationService.moderate({
      target: this.#target,
      text: this.#templateRenderer.render(input)
    }).text;
  }
}
