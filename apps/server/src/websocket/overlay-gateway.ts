import type {
  OverlayAccessDenialReason,
  OverlayAccessService,
  OverlayInstruction,
  OverlayPurpose,
  OverlayRouteAccessRequest,
  OverlayScope
} from "@stream-jams/core";

export interface OverlayGatewaySocket {
  send(data: string): void;
  close(code: number, reason: string): void;
}

export type OverlayGatewayClientRegistration = OverlayRouteAccessRequest;

export interface OverlayGatewayClient {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
}

export type OverlayGatewayRegistrationResult =
  | {
      readonly authorized: true;
      readonly clientId: string;
    }
  | {
      readonly authorized: false;
      readonly reason: OverlayAccessDenialReason;
    };

export interface OverlayGatewayDeliveryResult {
  readonly deliveredClientIds: readonly string[];
  readonly skippedClientIds: readonly string[];
}

export interface OverlayGatewayPlaybackReport {
  readonly clientId: string;
  readonly instructionId: string;
  readonly status: "started" | "completed" | "failed";
  readonly message: string | null;
}

export interface OverlayGatewayDependencies {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly generateClientId: () => string;
  readonly onPlaybackReport?: (report: OverlayGatewayPlaybackReport) => void;
}

interface RegisteredOverlayGatewayClient extends OverlayGatewayClient {
  readonly socket: OverlayGatewaySocket;
}

type OverlayGatewayMessage =
  | {
      readonly type: "overlay.connected";
      readonly clientId: string;
      readonly overlayId: string;
      readonly moduleId: string | null;
      readonly purpose: OverlayPurpose;
      readonly scope: OverlayScope;
    }
  | {
      readonly type: "overlay.playback";
      readonly instruction: OverlayInstruction;
    }
  | {
      readonly type: "overlay.error";
      readonly code: string;
      readonly message: string;
    };

export class OverlayGateway {
  readonly #overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly #generateClientId: () => string;
  readonly #onPlaybackReport: (report: OverlayGatewayPlaybackReport) => void;
  readonly #clients = new Map<string, RegisteredOverlayGatewayClient>();

  constructor(dependencies: OverlayGatewayDependencies) {
    this.#overlayAccessService = dependencies.overlayAccessService;
    this.#generateClientId = dependencies.generateClientId;
    this.#onPlaybackReport = dependencies.onPlaybackReport ?? (() => undefined);
  }

  get clients(): readonly OverlayGatewayClient[] {
    return Array.from(this.#clients.values()).map((client) => ({
      id: client.id,
      overlayId: client.overlayId,
      moduleId: client.moduleId,
      purpose: client.purpose,
      scope: client.scope
    }));
  }

  async registerClient(
    socket: OverlayGatewaySocket,
    registration: OverlayGatewayClientRegistration
  ): Promise<OverlayGatewayRegistrationResult> {
    const verification = await this.#overlayAccessService.verifyRouteAccess(registration);
    if (!verification.authorized) {
      sendGatewayMessage(socket, {
        type: "overlay.error",
        code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED",
        message: "Overlay route key is not authorized for this output"
      });
      socket.close(1008, "Overlay route key is not authorized for this output");
      return {
        authorized: false,
        reason: verification.reason
      };
    }

    const clientId = this.#generateClientId();
    this.#clients.set(clientId, {
      id: clientId,
      socket,
      overlayId: registration.overlayId,
      moduleId: registration.moduleId,
      purpose: registration.purpose,
      scope: registration.scope
    });
    sendGatewayMessage(socket, {
      type: "overlay.connected",
      clientId,
      overlayId: registration.overlayId,
      moduleId: registration.moduleId,
      purpose: registration.purpose,
      scope: registration.scope
    });

    return {
      authorized: true,
      clientId
    };
  }

  unregisterClient(clientId: string): void {
    this.#clients.delete(clientId);
  }

  deliverPlaybackInstruction(instruction: OverlayInstruction): OverlayGatewayDeliveryResult {
    const deliveredClientIds: string[] = [];
    const skippedClientIds: string[] = [];

    for (const client of this.#clients.values()) {
      if (clientMatchesInstruction(client, instruction)) {
        sendGatewayMessage(client.socket, {
          type: "overlay.playback",
          instruction
        });
        deliveredClientIds.push(client.id);
      } else {
        skippedClientIds.push(client.id);
      }
    }

    return {
      deliveredClientIds,
      skippedClientIds
    };
  }

  handleClientMessage(clientId: string, rawMessage: string): void {
    if (!this.#clients.has(clientId)) {
      return;
    }

    const report = parsePlaybackReport(clientId, rawMessage);
    if (report !== null) {
      this.#onPlaybackReport(report);
    }
  }
}

function clientMatchesInstruction(client: OverlayGatewayClient, instruction: OverlayInstruction): boolean {
  if (
    client.overlayId !== instruction.overlayId ||
    client.purpose !== instruction.purpose ||
    client.scope !== instruction.scope
  ) {
    return false;
  }

  if (client.scope === "module") {
    return client.moduleId === instruction.moduleId;
  }

  return client.moduleId === null;
}

function parsePlaybackReport(clientId: string, rawMessage: string): OverlayGatewayPlaybackReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as {
    readonly type?: unknown;
    readonly instructionId?: unknown;
    readonly message?: unknown;
  };
  if (typeof candidate.type !== "string" || typeof candidate.instructionId !== "string") {
    return null;
  }

  if (
    candidate.type !== "overlay.playback.started" &&
    candidate.type !== "overlay.playback.completed" &&
    candidate.type !== "overlay.playback.failed"
  ) {
    return null;
  }

  return {
    clientId,
    instructionId: candidate.instructionId,
    status: candidate.type.replace("overlay.playback.", "") as OverlayGatewayPlaybackReport["status"],
    message: typeof candidate.message === "string" && candidate.message.trim() !== "" ? candidate.message : null
  };
}

function sendGatewayMessage(socket: OverlayGatewaySocket, message: OverlayGatewayMessage): void {
  socket.send(JSON.stringify(message));
}
