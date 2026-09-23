import {
  alertSetMutationInputSchema,
  type AlertEditorErrorReportInput,
  type AlertEditorErrorReportResult,
  type AlertSetMutationInput
} from "@stream-jams/core";
import { sendHttpError } from "../errors.js";
import {
  AlertEditorDeliveryBlockedError,
  AlertEditorLiveImpactConfirmationRequiredError,
  AlertEditorNotFoundError,
  AlertEditorValidationError
} from "../../modules/alerts/alert-editor-service.js";
import {
  AlertManagedLiveImpactConfirmationRequiredError,
  AlertRuleForSetNotFoundError,
  AlertSetActivationBlockedError,
  AlertSetActivationConfirmationRequiredError,
  AlertSetDeleteBlockedError,
  AlertSetNameConflictError,
  AlertSetNotFoundError,
  AlertVariationNameConflictError
} from "../../modules/alerts/alert-set-management-service.js";
import {
  AssetLibraryInUseError,
  AssetLibraryNotFoundError
} from "../../modules/assets/asset-library-service.js";
import {
  ProviderActivationBlockedError,
  ProviderActivationConfirmationRequiredError,
  ProviderRegistrationNotFoundError
} from "../../modules/providers/provider-management-service.js";

type ErrorReply = Parameters<typeof sendHttpError>[0];

export interface AlertEditorErrorReporter {
  readonly reportAlertEditorError: (
    alertId: string,
    input: AlertEditorErrorReportInput
  ) => Promise<AlertEditorErrorReportResult>;
}

export interface AlertEditorErrorContext extends AlertEditorErrorReporter {
  readonly generateErrorId: () => string;
  readonly alertId: string;
  readonly setId: string | null;
  readonly summary: string;
  readonly nextStep: string;
}

export function sendAssetCommandError(reply: ErrorReply, error: unknown) {
  if (error instanceof AssetLibraryNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ASSET_NOT_FOUND",
      message: "The selected asset no longer exists. Refresh the asset library and try again."
    });
  }
  if (error instanceof AssetLibraryInUseError) {
    return reply.status(409).send({
      error: {
        code: "ASSET_IN_USE",
        message: "This asset is still in use. Reassign the listed Alerts and Screen Effects before deleting it."
      },
      impact: error.impact
    });
  }
  throw error;
}

export async function sendAlertEditorCommandError(
  reply: ErrorReply,
  error: unknown,
  context: AlertEditorErrorContext
) {
  if (error instanceof AlertEditorNotFoundError) {
    return recordAlertEditorError(
      reply,
      context,
      404,
      error.code,
      "The selected alert no longer exists. Return to the alert set and choose another alert."
    );
  }
  if (error instanceof AlertEditorValidationError) {
    return recordAlertEditorError(
      reply,
      context,
      422,
      error.code,
      `${error.message} Review the highlighted editor settings and try again.`
    );
  }
  if (error instanceof AlertEditorDeliveryBlockedError) {
    return recordAlertEditorError(reply, context, 409, error.code, error.message);
  }
  if (error instanceof AlertEditorLiveImpactConfirmationRequiredError) {
    return sendHttpError(reply, 409, { code: error.code, message: error.message });
  }
  throw error;
}

export async function recordAlertEditorError(
  reply: ErrorReply,
  context: AlertEditorErrorContext,
  statusCode: number,
  code: string,
  message: string
) {
  const referenceId = context.generateErrorId();
  await context.reportAlertEditorError(context.alertId, {
    setId: context.setId,
    error: {
      summary: context.summary,
      cause: message,
      nextStep: context.nextStep,
      severity: "error",
      occurredAt: new Date().toISOString(),
      referenceId,
      correction: null
    }
  });
  return sendHttpError(reply, statusCode, { code, id: referenceId, message });
}

export function sendProviderCommandError(reply: ErrorReply, error: unknown) {
  if (error instanceof ProviderRegistrationNotFoundError) {
    return sendHttpError(reply, 404, {
      code: error.code,
      message: "The selected provider registration no longer exists. Refresh the provider list and try again."
    });
  }
  if (error instanceof ProviderActivationBlockedError || error instanceof ProviderActivationConfirmationRequiredError) {
    return reply.status(409).send({ error: { code: error.code, message: error.message }, impact: error.impact });
  }
  throw error;
}

export function readAlertSetMutationInput(body: unknown, reply: ErrorReply): AlertSetMutationInput | null {
  const input = alertSetMutationInputSchema.safeParse(body);
  if (input.success) return input.data;
  sendHttpError(reply, 400, {
    code: "INVALID_ALERT_SET_NAME",
    message: "Enter an alert set name between 1 and 120 characters."
  });
  return null;
}

export function sendAlertSetCommandError(reply: ErrorReply, error: unknown) {
  if (error instanceof AlertSetNotFoundError || error instanceof AlertRuleForSetNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ALERT_SET_NOT_FOUND",
      message: "The selected alert set or alert no longer exists. Refresh the alert set and try again."
    });
  }
  if (error instanceof AlertSetNameConflictError) {
    return sendHttpError(reply, 409, {
      code: "ALERT_SET_NAME_CONFLICT",
      message: "Choose a different name; alert set names must be unique."
    });
  }
  if (error instanceof AlertVariationNameConflictError) {
    return sendHttpError(reply, 409, {
      code: "ALERT_VARIATION_NAME_CONFLICT",
      message: "Choose a different name; variations for the same alert must be unique."
    });
  }
  if (error instanceof AlertSetActivationBlockedError) {
    return reply.status(409).send({
      error: { code: "ALERT_SET_ACTIVATION_BLOCKED", message: error.message },
      impact: error.impact
    });
  }
  if (error instanceof AlertSetActivationConfirmationRequiredError) {
    return reply.status(409).send({
      error: { code: "ALERT_SET_ACTIVATION_CONFIRMATION_REQUIRED", message: error.message },
      impact: error.impact
    });
  }
  if (error instanceof AlertSetDeleteBlockedError) {
    return sendHttpError(reply, 409, {
      code: error.reason === "active" ? "ACTIVE_ALERT_SET_DELETE_BLOCKED" : "ONLY_ALERT_SET_DELETE_BLOCKED",
      message: error.message
    });
  }
  if (error instanceof AlertManagedLiveImpactConfirmationRequiredError) {
    return sendHttpError(reply, 409, { code: error.code, message: error.message });
  }
  throw error;
}

interface RuntimeContract<T> {
  parse(input: unknown): T;
}

export function parseList<T>(input: readonly unknown[], contract: RuntimeContract<T>): readonly T[] {
  return input.map((item) => contract.parse(item));
}

export function readValue(record: unknown, key: string): unknown {
  return typeof record === "object" && record !== null
    ? (record as Record<string, unknown>)[key]
    : undefined;
}

export function readParam(params: unknown, key: string): string {
  const value = readValue(params, key);
  return typeof value === "string" ? value : "";
}
