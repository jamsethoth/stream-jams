import type {
  OverlayAccessDenialReason,
  OverlayAccessService,
  OverlayInstruction,
  OverlayPurpose,
  OverlayRouteAccessRequest,
  OverlayScope,
  OverlayTargetProfileId
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
  readonly targetProfileId?: OverlayTargetProfileId | null;
  readonly connectedAt: string;
  readonly lastSeenAt: string;
  readonly userAgent: string | null;
}

export interface OverlayGatewayClientMetadata {
  readonly userAgent?: string | null;
}

export interface OverlayGatewayClientState extends OverlayGatewayClient {
  readonly connectionState: "connected" | "disconnected";
  readonly disconnectedAt: string | null;
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
  readonly clock?: () => Date;
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
      readonly targetProfileId?: OverlayTargetProfileId | null;
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
  readonly #clock: () => Date;
  readonly #onPlaybackReport: (report: OverlayGatewayPlaybackReport) => void;
  readonly #clients = new Map<string, RegisteredOverlayGatewayClient>();
  readonly #recentClientsByOutput = new Map<string, OverlayGatewayClientState>();

  constructor(dependencies: OverlayGatewayDependencies) {
    this.#overlayAccessService = dependencies.overlayAccessService;
    this.#generateClientId = dependencies.generateClientId;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#onPlaybackReport = dependencies.onPlaybackReport ?? (() => undefined);
  }

  get clients(): readonly OverlayGatewayClient[] {
    return Array.from(this.#clients.values()).map(toPublicClient);
  }

  get clientStates(): readonly OverlayGatewayClientState[] {
    return [
      ...Array.from(this.#clients.values()).map((client) => ({
        ...toPublicClient(client),
        connectionState: "connected" as const,
        disconnectedAt: null
      })),
      ...this.#recentClientsByOutput.values()
    ];
  }

  async registerClient(
    socket: OverlayGatewaySocket,
    registration: OverlayGatewayClientRegistration,
    metadata: OverlayGatewayClientMetadata = {}
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
    const connectedAt = this.#clock().toISOString();
    const client: RegisteredOverlayGatewayClient = {
      id: clientId,
      socket,
      overlayId: registration.overlayId,
      moduleId: registration.moduleId,
      purpose: registration.purpose,
      scope: registration.scope,
      targetProfileId: registration.targetProfileId ?? null,
      connectedAt,
      lastSeenAt: connectedAt,
      userAgent: metadata.userAgent ?? null
    };
    this.#clients.set(clientId, client);
    this.#recentClientsByOutput.delete(outputStateKey(client));
    sendGatewayMessage(socket, {
      type: "overlay.connected",
      clientId,
      overlayId: registration.overlayId,
      moduleId: registration.moduleId,
      purpose: registration.purpose,
      scope: registration.scope,
      ...(registration.targetProfileId === null || registration.targetProfileId === undefined
        ? {}
        : { targetProfileId: registration.targetProfileId })
    });

    return {
      authorized: true,
      clientId
    };
  }

  unregisterClient(clientId: string): void {
    const client = this.#clients.get(clientId);
    if (client === undefined) {
      return;
    }

    this.#clients.delete(clientId);
    this.#recentClientsByOutput.set(outputStateKey(client), {
      ...toPublicClient(client),
      connectionState: "disconnected",
      disconnectedAt: this.#clock().toISOString()
    });
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
    const client = this.#clients.get(clientId);
    if (client === undefined) {
      return;
    }

    this.#clients.set(clientId, {
      ...client,
      lastSeenAt: this.#clock().toISOString()
    });

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
    client.scope !== instruction.scope ||
    (client.targetProfileId ?? null) !== (instruction.targetProfileId ?? null)
  ) {
    return false;
  }

  if (client.scope === "module") {
    return client.moduleId === instruction.moduleId;
  }

  return client.moduleId === null;
}

function toPublicClient(client: RegisteredOverlayGatewayClient): OverlayGatewayClient {
  return {
    id: client.id,
    overlayId: client.overlayId,
    moduleId: client.moduleId,
    purpose: client.purpose,
    scope: client.scope,
    ...(client.targetProfileId === null || client.targetProfileId === undefined
      ? {}
      : { targetProfileId: client.targetProfileId }),
    connectedAt: client.connectedAt,
    lastSeenAt: client.lastSeenAt,
    userAgent: client.userAgent
  };
}

function outputStateKey(client: OverlayGatewayClient): string {
  return [
    client.overlayId,
    client.scope,
    client.moduleId ?? "unified",
    client.targetProfileId ?? "legacy",
    client.purpose
  ].join(":");
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
