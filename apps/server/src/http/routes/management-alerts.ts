import { randomUUID } from "node:crypto";
import {
  alertCreateInputSchema,
  alertEditorDocumentSchema,
  alertEditorErrorReportInputSchema,
  alertEditorErrorReportResultSchema,
  alertEditorSaveInputSchema,
  alertEditorTestRequestSchema,
  alertEditorTestResultSchema,
  alertInventoryRowSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetOverviewSchema,
  alertVariationAuthoringContextSchema,
  alertVariationCreateInputSchema,
  managedAlertMutationInputSchema,
  type AlertEditorErrorReportInput,
  type AlertEditorErrorReportResult
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import type { AlertEditorService } from "../../modules/alerts/alert-editor-service.js";
import type { AlertSetManagementService } from "../../modules/alerts/alert-set-management-service.js";
import {
  parseList,
  readAlertSetMutationInput,
  readParam,
  readValue,
  recordAlertEditorError,
  sendAlertEditorCommandError,
  sendAlertSetCommandError
} from "./management-route-errors.js";

type AlertSetCommands = Pick<
  AlertSetManagementService,
  | "listSets"
  | "getSet"
  | "createSet"
  | "createAlert"
  | "createAlertVariation"
  | "duplicateManagedAlert"
  | "resetManagedAlert"
  | "deleteManagedAlert"
  | "renameSet"
  | "duplicateSet"
  | "getActivationImpact"
  | "activateSet"
  | "markStarterReviewComplete"
  | "setAlertEnabled"
  | "deleteSet"
>;

type AlertEditorCommands = Pick<
  AlertEditorService,
  "getDocument" | "getVariationContext" | "saveDocument" | "sendTest"
>;

export interface ManagementAlertRouteDependencies {
  readonly alertSets: AlertSetCommands;
  readonly alertEditor: AlertEditorCommands;
  readonly reportClientError: (
    alertId: string,
    input: AlertEditorErrorReportInput
  ) => Promise<AlertEditorErrorReportResult>;
  readonly preHandlers: preHandlerHookHandler[];
  readonly generateServerErrorId?: (() => string) | undefined;
}

export function registerManagementAlertRoutes(
  app: FastifyInstance,
  dependencies: ManagementAlertRouteDependencies
): void {
  const { alertSets, alertEditor, reportClientError } = dependencies;
  const preHandler = dependencies.preHandlers;
  const generateErrorId = dependencies.generateServerErrorId ?? (() => `err_${randomUUID()}`);
  const errorContext = (
    alertId: string,
    setId: string | null,
    summary: string,
    nextStep: string
  ) => ({ reportAlertEditorError: reportClientError, generateErrorId, alertId, setId, summary, nextStep });

  app.get("/management/alert-sets", { preHandler }, async () =>
    parseList(await alertSets.listSets(), alertSetOverviewSchema)
  );

  app.get("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    try {
      return alertSetDetailSchema.parse(await alertSets.getSet(readParam(request.params, "setId")));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return reply.status(201).send(alertSetOverviewSchema.parse(await alertSets.createSet(input)));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.patch("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return alertSetOverviewSchema.parse(await alertSets.renameSet(readParam(request.params, "setId"), input));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/alerts", { preHandler }, async (request, reply) => {
    const input = alertCreateInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_CREATE_INPUT",
        message: "Choose a supported event type, reward selection, and starter theme, and enter an alert name between 1 and 120 characters."
      });
    }
    try {
      return reply.status(201).send(alertInventoryRowSchema.parse(
        await alertSets.createAlert(readParam(request.params, "setId"), input.data)
      ));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/duplicate", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return reply.status(201).send(
        alertSetOverviewSchema.parse(await alertSets.duplicateSet(readParam(request.params, "setId"), input))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.get("/management/alert-sets/:setId/activation-impact", { preHandler }, async (request, reply) => {
    try {
      return alertSetActivationImpactSchema.parse(
        await alertSets.getActivationImpact(readParam(request.params, "setId"))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/activate", { preHandler }, async (request, reply) => {
    const confirmation = readValue(request.body, "confirmWarnings");
    if (confirmation !== undefined && typeof confirmation !== "boolean") {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_SET_ACTIVATION_CONFIRMATION",
        message: "confirmWarnings must be true or false"
      });
    }
    try {
      return alertSetActivationResultSchema.parse(
        await alertSets.activateSet(readParam(request.params, "setId"), confirmation ?? false)
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/starter-review", { preHandler }, async (request, reply) => {
    try {
      return alertSetOverviewSchema.parse(
        await alertSets.markStarterReviewComplete(readParam(request.params, "setId"))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.patch("/management/alerts/:alertId/enabled", { preHandler }, async (request, reply) => {
    const enabled = readValue(request.body, "enabled");
    if (typeof enabled !== "boolean") {
      return sendHttpError(reply, 400, { code: "INVALID_ALERT_ENABLED_STATE", message: "enabled must be true or false" });
    }
    try {
      return alertSetDetailSchema.parse(
        await alertSets.setAlertEnabled(readParam(request.params, "alertId"), enabled)
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alerts/:alertId/variations", { preHandler }, async (request, reply) => {
    const input = alertVariationCreateInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_VARIATION_INPUT",
        message: "Enter a variation name between 1 and 120 characters."
      });
    }
    try {
      return reply.status(201).send(alertInventoryRowSchema.parse(
        await alertSets.createAlertVariation(readParam(request.params, "alertId"), input.data)
      ));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alerts/:alertId/duplicate", { preHandler }, async (request, reply) => {
    try {
      return reply.status(201).send(alertInventoryRowSchema.parse(
        await alertSets.duplicateManagedAlert(readParam(request.params, "alertId"))
      ));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alerts/:alertId/reset", { preHandler }, async (request, reply) => {
    const input = managedAlertMutationInputSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_MUTATION_CONFIRMATION",
        message: "confirmLiveImpact must be true or false."
      });
    }
    try {
      return alertInventoryRowSchema.parse(await alertSets.resetManagedAlert(
        readParam(request.params, "alertId"),
        input.data.confirmLiveImpact
      ));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.delete("/management/alerts/:alertId", { preHandler }, async (request, reply) => {
    const input = managedAlertMutationInputSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_MUTATION_CONFIRMATION",
        message: "confirmLiveImpact must be true or false."
      });
    }
    try {
      await alertSets.deleteManagedAlert(readParam(request.params, "alertId"), input.data.confirmLiveImpact);
      return reply.status(204).send();
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.delete("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    try {
      await alertSets.deleteSet(readParam(request.params, "setId"));
      return reply.status(204).send();
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.get("/management/alerts/:alertId/editor", { preHandler }, async (request, reply) => {
    const alertId = readParam(request.params, "alertId");
    try {
      return alertEditorDocumentSchema.parse(await alertEditor.getDocument(alertId));
    } catch (error) {
      return sendAlertEditorCommandError(reply, error, errorContext(
        alertId, null, "The alert editor could not be opened", "Return to Alerts and choose the alert again."
      ));
    }
  });

  app.get("/management/alerts/:alertId/editor/variation-context", { preHandler }, async (request, reply) => {
    const alertId = readParam(request.params, "alertId");
    try {
      return alertVariationAuthoringContextSchema.parse(await alertEditor.getVariationContext(alertId));
    } catch (error) {
      return sendAlertEditorCommandError(reply, error, errorContext(
        alertId, null, "The alert variation context could not be opened", "Return to Alerts and choose the alert again."
      ));
    }
  });

  app.put("/management/alerts/:alertId/editor", { preHandler }, async (request, reply) => {
    const alertId = readParam(request.params, "alertId");
    const input = alertEditorSaveInputSchema.safeParse(request.body);
    if (!input.success) {
      return recordAlertEditorError(
        reply,
        errorContext(
          alertId,
          null,
          "The alert was not saved",
          "Review the alert layers and target profiles, then try saving again."
        ),
        400,
        "INVALID_ALERT_EDITOR_DOCUMENT",
        "Review the alert layers and target profiles, then try saving again."
      );
    }
    try {
      return alertEditorDocumentSchema.parse(await alertEditor.saveDocument(
        alertId,
        input.data.document,
        input.data.confirmLiveImpact,
        input.data.priorityAssignments
      ));
    } catch (error) {
      return sendAlertEditorCommandError(reply, error, errorContext(
        alertId,
        input.data.document.setId,
        "The alert was not saved",
        "Review the selected profile and highlighted fields, then try again."
      ));
    }
  });

  app.post("/management/alerts/:alertId/editor/test", { preHandler }, async (request, reply) => {
    const alertId = readParam(request.params, "alertId");
    const input = alertEditorTestRequestSchema.safeParse(request.body);
    if (!input.success) {
      return recordAlertEditorError(
        reply,
        errorContext(
          alertId,
          null,
          "The alert test was not sent",
          "Choose a valid target profile or device-only delivery and sample payload, then try Send test again."
        ),
        400,
        "INVALID_ALERT_EDITOR_TEST",
        "Choose a valid target profile or device-only delivery and sample payload, then try Send test again."
      );
    }
    try {
      return alertEditorTestResultSchema.parse(await alertEditor.sendTest(alertId, input.data));
    } catch (error) {
      const nextStep = input.data.targetProfileId === null
        ? "Connect and review a Browser Source or choose an available device route, then try again."
        : `Connect and review the ${input.data.targetProfileId} output or choose an available device route, then try again.`;
      return sendAlertEditorCommandError(reply, error, errorContext(
        alertId, input.data.document.setId, "The alert test was not sent", nextStep
      ));
    }
  });

  app.post("/management/alerts/:alertId/editor/errors", { preHandler }, async (request) =>
    alertEditorErrorReportResultSchema.parse(await reportClientError(
      readParam(request.params, "alertId"),
      alertEditorErrorReportInputSchema.parse(request.body)
    ))
  );
}
