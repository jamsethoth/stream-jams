import { manualEventSubmissionSchema, type AlertEditorTestRequest, type AlertEditorTestResult, type BusEvent, type EventBusHandleOutcome, type ManualEventAction, type ManualSubmissionReceipt } from "@stream-jams/core";
import { AlertEditorDeliveryBlockedError, AlertEditorValidationError, type AlertEditorService } from "../alerts/alert-editor-service.js";
import type { EffectAdmissionOutcome, EffectAdmissionResult, EffectAdmissionService } from "../screen-effects/effect-admission-service.js";
import type { ManualEventService } from "./manual-event-service.js";

type CompletedResult = { readonly at: number } & (
  | { readonly kind: "alert"; readonly result: AlertEditorTestResult }
  | { readonly kind: "effect"; readonly result: EffectAdmissionOutcome }
  | { readonly kind: "error"; readonly error: unknown }
);

export interface ManualAlertEffectServiceOptions {
  readonly manualEvents: Pick<ManualEventService, "submit">;
  readonly alerts: Pick<AlertEditorService, "getDocument" | "validateTestReferences" | "consumeTest">;
  readonly effects: Pick<EffectAdmissionService, "handleEvent">;
  readonly now?: () => number;
}

/** Preserves completed command feedback without callbacks or waiting on blocked delivery.
 * Journal outcomes own acceptance/replay. This short-lived, capped cache is only HTTP response detail.
 */
export class ManualAlertEffectService {
  readonly #completed = new Map<string, CompletedResult>();
  readonly #now: () => number;
  constructor(private readonly options: ManualAlertEffectServiceOptions) { this.#now = options.now ?? Date.now; }

  async sendAlert(request: AlertEditorTestRequest): Promise<AlertEditorTestResult> {
    await this.options.alerts.validateTestReferences(request);
    const input = { action: { kind: "alert-draft-test" as const, request } };
    if (!manualEventSubmissionSchema.safeParse(input).success) throw new AlertEditorValidationError(["The manual test exceeds the 65,536-byte JSON limit or contains invalid sample data. Reduce the draft/sample size before sending."]);
    return this.#alertReceipt(await this.options.manualEvents.submit(input, { channel: "management" }), request.targetProfileId);
  }

  async sendSavedAlert(action: Extract<ManualEventAction, { kind: "alert-saved-test" }>): Promise<AlertEditorTestResult> {
    const request = await this.#savedRequest(action);
    await this.options.alerts.validateTestReferences(request);
    return this.#alertReceipt(await this.options.manualEvents.submit({ action }, { channel: "management" }), action.targetProfileId);
  }

  async sendEffect(effectId: string, variantId: string): Promise<EffectAdmissionOutcome> {
    const receipt = await this.options.manualEvents.submit({ action: { kind: "effect-test", effectId, variantId, confirmLiveImpact: true } }, { channel: "management" });
    const completed = this.#take(receipt.eventId);
    if (completed?.kind === "error") throw completed.error;
    if (completed?.kind === "effect") return { ...completed.result, busId: receipt.busId, eventId: receipt.eventId };
    if (receipt.consumers.find(consumer => consumer.consumerId === "screen-effects")?.outcome !== "pending") throw new Error(`Manual effect delivery did not complete. Review Diagnostics for ${receipt.busId}.`);
    return { effectId, status: "pending", busId: receipt.busId, eventId: receipt.eventId };
  }

  async handleAlert(event: Extract<BusEvent, { kind: "manual" }>): Promise<EventBusHandleOutcome> {
    if (event.action.kind !== "alert-draft-test" && event.action.kind !== "alert-saved-test") return "no-match";
    try {
      const request = event.action.kind === "alert-draft-test" ? event.action.request : await this.#savedRequest(event.action);
      await this.options.alerts.validateTestReferences(request);
      const result = await this.options.alerts.consumeTest(request.document.id, request, event);
      this.#store(event.eventId, { kind: "alert", result, at: this.#now() });
      return "admitted";
    } catch (error) {
      this.#store(event.eventId, { kind: "error", error, at: this.#now() });
      throw error;
    }
  }

  async handleEffect(event: BusEvent): Promise<EffectAdmissionResult> {
    try {
      const result = await this.options.effects.handleEvent(event);
      if (event.kind === "manual" && event.action.kind === "effect-test") {
        const outcome = result.outcomes[0];
        if (outcome !== undefined) this.#store(event.eventId, { kind: "effect", result: outcome, at: this.#now() });
      }
      return result;
    } catch (error) {
      if (event.kind === "manual" && event.action.kind === "effect-test") this.#store(event.eventId, { kind: "error", error, at: this.#now() });
      throw error;
    }
  }

  async #savedRequest(action: Extract<ManualEventAction, { kind: "alert-saved-test" }>): Promise<AlertEditorTestRequest> {
    return { document: await this.options.alerts.getDocument(action.alertId), targetProfileId: action.targetProfileId, samplePayload: action.samplePayload, includeAudio: action.includeAudio, includeTts: action.includeTts };
  }

  #alertReceipt(receipt: ManualSubmissionReceipt, targetProfileId: AlertEditorTestRequest["targetProfileId"]): AlertEditorTestResult {
    const completed = this.#take(receipt.eventId);
    if (completed?.kind === "error") throw completed.error;
    if (completed?.kind === "alert") return { ...completed.result, busId: receipt.busId, eventId: receipt.eventId };
    if (receipt.consumers.find(consumer => consumer.consumerId === "alerts")?.outcome !== "pending") throw new AlertEditorDeliveryBlockedError(`Manual alert delivery did not complete. Review Diagnostics for ${receipt.busId}.`);
    return { status: "pending", targetProfileId, referenceId: receipt.busId, eventId: receipt.eventId, busId: receipt.busId, test: true, deliveredDestinations: [], unavailableDestinations: [] };
  }

  #prune(): void {
    const cutoff = this.#now() - 60_000;
    for (const [key, value] of this.#completed) if (value.at < cutoff) this.#completed.delete(key);
  }
  #store(eventId: string, result: CompletedResult): void {
    this.#prune();
    this.#completed.set(eventId, result);
    while (this.#completed.size > 128) this.#completed.delete(this.#completed.keys().next().value!);
  }
  #take(eventId: string): CompletedResult | undefined {
    this.#prune();
    const result = this.#completed.get(eventId);
    this.#completed.delete(eventId);
    return result;
  }
}
