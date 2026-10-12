import fastifyWebsocket from "@fastify/websocket";
import {
  classifyRetiredOverlayOutput,
  overlayCompositionSchema,
  type RetiredOverlayOutputKind,
  type OverlayAccessService,
  type OverlayCompositionService,
  type OverlayModuleRegistry,
  type OverlayRouteAccessRequest
} from "@stream-jams/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import {
  createOverlayAuthPreHandler,
  sendTransparentOverlayRejection,
  parseOverlayTargetProfileQuery
} from "../middleware/overlay-auth.js";
import type { OverlayGateway, OverlayGatewaySocket } from "../../websocket/overlay-gateway.js";
import { readModuleOverlayParams, readUnifiedOverlayParams } from "./overlay-route-params.js";
import { sendHtml, type WebShellRenderer } from "./web-shell.js";

const defaultOverlayId = "default";

export interface OverlayRouteDependencies {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly overlayCompositionService: OverlayCompositionService;
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "listModules">;
  readonly webShellRenderer: Pick<WebShellRenderer, "renderOverlayShell">;
  readonly overlayGateway?: OverlayGateway;
  /** Bounded, redacted visibility for old test/unified URLs; never changes the fail-closed response. */
  readonly recordRetiredOutputAttempt?: ((kind: RetiredOverlayOutputKind) => void) | undefined;
}

export function registerOverlayRoutes(app: FastifyInstance, dependencies: OverlayRouteDependencies): void {
  const record = dependencies.recordRetiredOutputAttempt;
  const retiredModule = { classifyRetiredRoute: classifyRetiredModuleRoute, onRetiredOutput: record };
  const shellPreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService, resolveAccessRequest: resolveModuleOverlayAccessRequest, shell: true, ...retiredModule
  });
  const modulePreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveModuleOverlayAccessRequest,
    ...retiredModule
  });
  const unifiedPreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveUnifiedOverlayAccessRequest,
    classifyRetiredRoute: () => "unified",
    onRetiredOutput: record
  });

  app.get("/overlay/modules/:moduleId/:purpose", { preHandler: shellPreHandler }, async (_request, reply) =>
    sendHtml(reply, await dependencies.webShellRenderer.renderOverlayShell())
  );
  app.get("/overlay/modules/:moduleId/:purpose/:overlayKey", { preHandler: shellPreHandler }, async (_request, reply) =>
    sendHtml(reply, await dependencies.webShellRenderer.renderOverlayShell())
  );
  app.get(
    "/overlay/modules/:moduleId/:purpose/:overlayKey/composition",
    { preHandler: modulePreHandler },
    async (request) => {
      const params = readModuleOverlayParams(request.params);
      const profile = parseOverlayTargetProfileQuery(request.query, true);
      if (params.purpose === null || !profile.valid) {
        throw new Error("Overlay purpose must be live or test");
      }

      const composition = await dependencies.overlayCompositionService.resolveModuleOutput({
        moduleId: params.moduleId,
        overlayId: defaultOverlayId,
        purpose: params.purpose,
        ...(profile.targetProfileId === null ? {} : { targetProfileId: profile.targetProfileId })
      });

      return overlayCompositionSchema.parse(composition);
    }
  );

  // Retired navigation gets no executable shell or visible diagnostic document.
  app.get("/overlay/unified/:purpose", async (_request, reply) => { record?.("unified"); return sendTransparentOverlayRejection(reply); });
  app.get("/overlay/unified/:purpose/:overlayKey", async (_request, reply) => { record?.("unified"); return sendTransparentOverlayRejection(reply); });
  app.get(
    "/overlay/unified/:purpose/:overlayKey/composition",
    { preHandler: unifiedPreHandler },
    async (_request, reply) => reply.status(401).send({ error: { code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED" } })
  );

  if (dependencies.overlayGateway !== undefined) {
    app.register(fastifyWebsocket);
    app.register(async (webSocketApp) => registerOverlayWebSocketRoutes(webSocketApp, dependencies, record));
  }
}

function classifyRetiredModuleRoute(request: FastifyRequest): RetiredOverlayOutputKind | null {
  return classifyRetiredOverlayOutput({ scope: "module", purpose: readModuleOverlayParams(request.params).purpose });
}

function registerOverlayWebSocketRoutes(app: FastifyInstance, dependencies: OverlayRouteDependencies, record: ((kind: RetiredOverlayOutputKind) => void) | undefined): void {
  app.get("/overlay/ws/modules/:moduleId/:purpose/:overlayKey", { websocket: true }, (socket, request) => {
    const retired = classifyRetiredModuleRoute(request);
    if (retired !== null) record?.(retired);
    registerWebSocketClient(dependencies, socket, resolveModuleOverlayAccessRequest(request), readUserAgent(request));
  });
  app.get("/overlay/ws/unified/:purpose/:overlayKey", { websocket: true }, (socket, request) => {
    record?.("unified");
    registerWebSocketClient(dependencies, socket, resolveUnifiedOverlayAccessRequest(request), readUserAgent(request));
  });
}

function registerWebSocketClient(
  dependencies: OverlayRouteDependencies,
  socket: WebSocket,
  accessRequest: OverlayRouteAccessRequest | null,
  userAgent: string | null
): void {
  const overlayGateway = dependencies.overlayGateway!;
  let clientId: string | null = null;
  let closed = false;
  socket.on("message", (data) => {
    if (clientId !== null) {
      overlayGateway.handleClientMessage(clientId, data.toString());
    }
  });
  socket.on("close", (code, reason) => {
    closed = true;
    if (clientId !== null) {
      overlayGateway.unregisterClient(clientId, { code, reason: reason.toString() });
    }
  });

  if (accessRequest === null) {
    socket.close(1008, "A valid overlay route key path segment is required");
    return;
  }

  void overlayGateway.registerClient(toGatewaySocket(socket), accessRequest, {
    userAgent
  }).then(async (result) => {
    if (result.authorized) {
      clientId = result.clientId;
      if (closed) { overlayGateway.unregisterClient(clientId); return; }
      const ticket = overlayGateway.reserveComposition(clientId);
      const composition = await dependencies.overlayCompositionService.resolveModuleOutput({ moduleId: accessRequest.moduleId!, overlayId: accessRequest.overlayId, purpose: accessRequest.purpose,
        ...(accessRequest.targetProfileId == null ? {} : { targetProfileId: accessRequest.targetProfileId }) });
      overlayGateway.deliverComposition(clientId, composition, ticket);
    }
  }).catch(
    // error-provenance: allow expected -- composition failures close transparently and retire registered recipients
    () => {
    if (clientId !== null) overlayGateway.unregisterClient(clientId);
    socket.close(1011, "Overlay composition unavailable");
  });
}

function readUserAgent(request: FastifyRequest): string | null {
  const value = request.headers["user-agent"];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toGatewaySocket(socket: WebSocket): OverlayGatewaySocket {
  return {
    send(data: string) {
      socket.send(data);
    },
    close(code: number, reason: string) {
      socket.close(code, reason);
    }
  };
}

function resolveModuleOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readModuleOverlayParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, true);
  if (params.moduleId === "" || params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: params.moduleId,
    purpose: params.purpose,
    scope: "module",
    targetProfileId: profile.targetProfileId,
    rawKey: params.overlayKey
  };
}

function resolveUnifiedOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readUnifiedOverlayParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, false);
  if (params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: null,
    purpose: params.purpose,
    scope: "unified",
    targetProfileId: null,
    rawKey: params.overlayKey
  };
}
