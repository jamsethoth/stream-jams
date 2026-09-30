import { playbackTimingDiagnosticsSchema, type PlaybackTimingDiagnostics, serializeException, overlayCompositionSchema, surfaceConfigurationSchema, type OverlayComposition, type SurfaceLayer } from "@stream-jams/core";
import type {
  OverlayAccessDenialReason,
  OverlayAccessService,
  OverlayInstruction,
  OverlayPurpose,
  OverlayRouteAccessRequest,
  OverlayScope,
  OverlayTargetProfileId
} from "@stream-jams/core";
import { overlayPlaybackFailureSchema, type OverlayPlaybackFailure, type SerializedException } from "@stream-jams/core";

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
  readonly diagnostics?: PlaybackTimingDiagnostics;
  readonly clientId: string;
  readonly instructionId: string;
  readonly status: "started" | "completed" | "failed";
  readonly message: string | null;
  readonly referenceId: string | null;
  readonly stage: OverlayPlaybackFailure["stage"] | null;
  readonly exception: SerializedException | null;
  readonly targetProfileId: OverlayTargetProfileId | null;
}

export interface OverlayTransportDiagnostic {
  readonly clientId: string;
  readonly operation: "send" | "close" | "connect";
  readonly exception: SerializedException | null;
  readonly closeCode: number | null;
  readonly closeReason: string | null;
  readonly outcome: "disconnected" | "reconnected";
}

export interface OverlayGatewayDependencies {
  readonly onTransportDiagnostic?: (diagnostic: OverlayTransportDiagnostic) => void;
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly generateClientId: () => string;
  readonly clock?: () => Date;
  readonly onClientDisconnected?: (clientId: string) => void;
  readonly onPlaybackReport?: (report: OverlayGatewayPlaybackReport) => void;
  readonly initialPlaybackMuted?: boolean;
}

interface RegisteredOverlayGatewayClient extends OverlayGatewayClient {
  readonly socket: OverlayGatewaySocket;
  readonly sanitize: (text: string) => string;
}

type OverlayGatewayMessage =
  | { readonly type: "overlay.playback.prepare"; readonly instruction: OverlayInstruction }
  | { readonly type: "overlay.playback.start"; readonly instructionId: string; readonly startsAtEpochMs: number }
  | { readonly type: "overlay.surface-layers"; readonly layers: readonly SurfaceLayer[] }
  | { readonly type: "overlay.composition"; readonly composition: OverlayComposition }
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
      readonly type: "overlay.playback.audio-state";
      readonly muted: boolean;
    }
  | {
      readonly type: "overlay.playback.stop";
      readonly instructionIds: readonly string[];
    }
  | {
      readonly type: "overlay.error";
      readonly code: string;
      readonly message: string;
    };

interface PlaybackPreparation {
  readonly pending: Map<string, (ready: boolean) => void>;
  readonly eligible: Set<string>;
  expiry: ReturnType<typeof setTimeout> | undefined;
}

export class OverlayGateway {
  readonly #overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly #generateClientId: () => string;
  readonly #clock: () => Date;
  readonly #onClientDisconnected: (clientId: string) => void;
  readonly #onPlaybackReport: (report: OverlayGatewayPlaybackReport) => void;
  readonly #onTransportDiagnostic: (diagnostic: OverlayTransportDiagnostic) => void;
  readonly #clients = new Map<string, RegisteredOverlayGatewayClient>();
  readonly #recentClientsByOutput = new Map<string, OverlayGatewayClientState>();
  readonly #preparations = new Map<string, PlaybackPreparation>();
  #playbackMuted: boolean;
  readonly #surfaceLayers = new Map<string, readonly SurfaceLayer[]>();

  constructor(dependencies: OverlayGatewayDependencies) {
    this.#onTransportDiagnostic = dependencies.onTransportDiagnostic ?? (() => undefined);
    this.#overlayAccessService = dependencies.overlayAccessService;
    this.#generateClientId = dependencies.generateClientId;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#onClientDisconnected = dependencies.onClientDisconnected ?? (() => undefined);
    this.#onPlaybackReport = dependencies.onPlaybackReport ?? (() => undefined);
    this.#playbackMuted = dependencies.initialPlaybackMuted ?? false;
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
      sanitize: text => text.replaceAll(registration.rawKey, "[redacted]").replace(/(?:https?|wss?):\/\/[^\s]+/giu, "[redacted-url]").slice(0, 512),
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
    const reconnecting = this.#recentClientsByOutput.delete(outputStateKey(client));
    this.#send(client, {
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
    this.#send(client, {
      type: "overlay.playback.audio-state",
      muted: this.#playbackMuted
    });
    const layers = this.#surfaceLayers.get(registration.overlayId);
    if (registration.scope === "unified" && layers !== undefined) {
      this.#send(client, { type: "overlay.surface-layers", layers });
    }

    if (reconnecting && this.#clients.has(clientId)) this.#onTransportDiagnostic({ clientId, operation: "connect", exception: null, closeCode: null, closeReason: null, outcome: "reconnected" });

    return {
      authorized: true,
      clientId
    };
  }

  unregisterClient(clientId: string, close?: { readonly code: number; readonly reason: string }): void {
    const client = this.#clients.get(clientId);
    if (client === undefined) {
      return;
    }

    if (close !== undefined) this.#onTransportDiagnostic({ clientId, operation: "close", exception: null,
      closeCode: close.code, closeReason: client.sanitize(close.reason), outcome: "disconnected" });
    this.#clients.delete(clientId);
    for (const [instructionId, preparation] of this.#preparations) {
      preparation.pending.get(clientId)?.(false);
      preparation.eligible.delete(clientId);
      if (preparation.pending.size === 0 && preparation.eligible.size === 0) this.#cancelPreparation(instructionId, preparation);
    }
    this.#recentClientsByOutput.set(outputStateKey(client), {
      ...toPublicClient(client),
      connectionState: "disconnected",
      disconnectedAt: this.#clock().toISOString()
    });
    this.#onClientDisconnected(clientId);
  }

  async preparePlaybackInstruction(instruction: OverlayInstruction): Promise<{ readonly deliveredClientIds: readonly string[]; start(startsAtEpochMs: number): void }> {
    const recipients = [...this.#clients.values()].filter(client => clientMatchesInstruction(client, instruction));
    const previous = this.#preparations.get(instruction.id);
    if (previous !== undefined) this.#cancelPreparation(instruction.id, previous);
    const preparation: PlaybackPreparation = { eligible: new Set(), pending: new Map(), expiry: undefined };
    const { eligible, pending } = preparation;
    this.#preparations.set(instruction.id, preparation);
    const readiness = recipients.map(client => new Promise<string | null>(resolve => {
      const finish = (success: boolean) => {
        if (!pending.has(client.id)) return;
        const accepted = success && this.#preparations.get(instruction.id) === preparation;
        if (accepted) eligible.add(client.id);
        clearTimeout(timer); pending.delete(client.id); resolve(accepted ? client.id : null);
      };
      const timer = setTimeout(() => {
        this.#onPlaybackReport({ clientId: client.id, instructionId: instruction.id, status: "failed", message: "Browser media preparation timed out.",
          referenceId: `err_${crypto.randomUUID()}`, stage: "decode", exception: serializeException(new Error("Browser media readiness was not acknowledged within 6000ms.")), targetProfileId: client.targetProfileId ?? null });
        try { sendGatewayMessage(client.socket, { type: "overlay.playback.stop", instructionIds: [instruction.id] }); }
        // error-provenance: allow expected -- failed transport is retired and never included in prepared recipients
        catch (error) { this.#sendFailed(client.id, error); }
        finish(false);
      }, 6000);
      pending.set(client.id, finish);
    }));
    for (const client of recipients) {
      try { sendGatewayMessage(client.socket, { type: "overlay.playback.prepare", instruction }); }
      // error-provenance: allow expected -- failed transport is retired and never included in prepared recipients
      catch (error) { this.#sendFailed(client.id, error); }
    }
    const ready = await Promise.all(readiness);
    const current = () => this.#preparations.get(instruction.id) === preparation;
    const deliveredClientIds = ready.filter((id): id is string => current() && id !== null && eligible.has(id) && this.#clients.has(id));
    if (current() && deliveredClientIds.length === 0) this.#cancelPreparation(instruction.id, preparation);
    if (current()) {
      preparation.expiry = setTimeout(() => {
        if (current()) this.stopPlaybackInstructions([instruction.id]);
      }, 20000);
      preparation.expiry.unref();
    }
    let started = false;
    return { deliveredClientIds, start: startsAtEpochMs => {
      if (started || !current()) return;
      started = true;
      clearTimeout(preparation.expiry);
      this.#preparations.delete(instruction.id);
      for (const id of deliveredClientIds) {
        const client = this.#clients.get(id);
        if (client === undefined || !eligible.has(id)) continue;
        try { sendGatewayMessage(client.socket, { type: "overlay.playback.start", instructionId: instruction.id, startsAtEpochMs }); }
        // error-provenance: allow expected -- failed current transport is retired without affecting healthy recipients
        catch (error) { this.#sendFailed(id, error); }
      }
    } };
  }

  #send(client: RegisteredOverlayGatewayClient, message: OverlayGatewayMessage): boolean {
    if (!this.#clients.has(client.id)) return false;
    try { sendGatewayMessage(client.socket, message); return true; }
    // error-provenance: allow expected -- bounded sanitized cause is recorded before retiring the connection
    catch (error) { this.#sendFailed(client.id, error); return false; }
  }

  #sendFailed(clientId: string, error: unknown): void {
    const client = this.#clients.get(clientId);
    if (client === undefined) return;
    const exception = JSON.parse(JSON.stringify(serializeException(error, { messageCharacters: 512, stackCharacters: 2048, totalUtf8Bytes: 8192 }),
      (_key, value: unknown) => typeof value === "string" ? client.sanitize(value) : value)) as SerializedException;
    this.#onTransportDiagnostic({ clientId, operation: "send", exception, closeCode: null, closeReason: null, outcome: "disconnected" });
    this.unregisterClient(clientId);
  }

  #cancelPreparation(instructionId: string, preparation: PlaybackPreparation): void {
    if (this.#preparations.get(instructionId) !== preparation) return;
    this.#preparations.delete(instructionId);
    clearTimeout(preparation.expiry);
    preparation.eligible.clear();
    for (const finish of preparation.pending.values()) finish(false);
  }

  deliverPlaybackInstruction(instruction: OverlayInstruction): OverlayGatewayDeliveryResult {
    const deliveredClientIds: string[] = [];
    const skippedClientIds: string[] = [];

    for (const client of this.#clients.values()) {
      if (clientMatchesInstruction(client, instruction)) {
        if (this.#send(client, { type: "overlay.playback", instruction })) deliveredClientIds.push(client.id);
        else skippedClientIds.push(client.id);
      } else {
        skippedClientIds.push(client.id);
      }
    }

    return {
      deliveredClientIds,
      skippedClientIds
    };
  }

  deliverComposition(clientId: string, candidate: unknown): boolean {
    const client = this.#clients.get(clientId);
    if (client === undefined) return false;
    const composition = overlayCompositionSchema.parse(candidate) as OverlayComposition;
    if (composition.overlayId !== client.overlayId || composition.purpose !== client.purpose || composition.scope !== client.scope ||
      (composition.targetProfileId ?? null) !== (client.targetProfileId ?? null) ||
      (client.scope === "module" && composition.modules.some(module => module.moduleId !== client.moduleId))) return false;
    try { sendGatewayMessage(client.socket, { type: "overlay.composition", composition }); return true; }
    // error-provenance: allow expected -- a failed current-client send is converted to disconnect and a false delivery result
    catch (error) { this.#sendFailed(clientId, error); return false; }
  }

  setPlaybackMuted(muted: boolean): void {
    this.#playbackMuted = muted;
    for (const client of this.#clients.values()) {
      this.#send(client, { type: "overlay.playback.audio-state", muted });
    }
  }

  setSurfaceLayers(candidate: unknown): void {
    const surface = surfaceConfigurationSchema.parse(candidate);
    if (surface.kind !== "unified-browser") throw new Error("Expected a unified browser surface");
    this.#surfaceLayers.set(surface.overlayId, surface.layers);
    for (const client of this.#clients.values()) {
      if (client.scope === "unified" && client.overlayId === surface.overlayId) {
        try { sendGatewayMessage(client.socket, { type: "overlay.surface-layers", layers: surface.layers }); }
        // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
        catch (error) { this.#sendFailed(client.id, error); }
      }
    }
  }

  stopPlaybackInstructions(instructionIds: readonly string[]): void {
    const uniqueInstructionIds = [...new Set(instructionIds.filter((instructionId) => instructionId !== ""))];
    if (uniqueInstructionIds.length === 0) {
      return;
    }

    for (const id of uniqueInstructionIds) {
      const preparation = this.#preparations.get(id);
      if (preparation !== undefined) this.#cancelPreparation(id, preparation);
    }
    for (const client of this.#clients.values()) {
      this.#send(client, {
        type: "overlay.playback.stop",
        instructionIds: uniqueInstructionIds
      });
    }
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

    if (rawMessage.length <= 1000) {
      try {
        const candidate = JSON.parse(rawMessage) as { type?: unknown; instructionId?: unknown };
        if (candidate.type === "overlay.playback.ready" && typeof candidate.instructionId === "string") {
          this.#preparations.get(candidate.instructionId)?.pending.get(clientId)?.(true);
          return;
        }
      }
      // error-provenance: allow expected -- malformed input is ignored by report validation below
      catch { /* invalid input */ }
    }
    const report = parsePlaybackReport(client, rawMessage);
    if (report !== null) {
      if (report.status === "failed") {
        const preparation = this.#preparations.get(report.instructionId);
        if (preparation !== undefined) {
          preparation.pending.get(clientId)?.(false);
          preparation.eligible.delete(clientId);
          if (preparation.pending.size === 0 && preparation.eligible.size === 0) this.#cancelPreparation(report.instructionId, preparation);
        }
      }
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

function parsePlaybackReport(client: RegisteredOverlayGatewayClient, rawMessage: string): OverlayGatewayPlaybackReport | null {
  if (new TextEncoder().encode(rawMessage).byteLength > 70_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage) as unknown;
  }
  // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
  catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as {
    readonly type?: unknown;
    readonly instructionId?: unknown;
    readonly message?: unknown;
    readonly referenceId?: unknown;
    readonly stage?: unknown;
    readonly exception?: unknown;
    readonly diagnostics?: unknown;
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

  const failure = candidate.type === "overlay.playback.failed"
    ? overlayPlaybackFailureSchema.safeParse({
        referenceId: candidate.referenceId,
        stage: candidate.stage,
        message: candidate.message,
        exception: candidate.exception
      })
    : null;
  if (candidate.type === "overlay.playback.failed" && (failure === null || !failure.success)) return null;

  const diagnostics = candidate.diagnostics === undefined ? undefined : playbackTimingDiagnosticsSchema.safeParse(candidate.diagnostics);
  if (diagnostics !== undefined && !diagnostics.success) return null;
  return {
    ...(diagnostics?.success === true ? { diagnostics: diagnostics.data } : {}),
    clientId: client.id,
    instructionId: candidate.instructionId,
    status: candidate.type.replace("overlay.playback.", "") as OverlayGatewayPlaybackReport["status"],
    message: failure?.success === true ? failure.data.message : null,
    referenceId: failure?.success === true ? failure.data.referenceId : null,
    stage: failure?.success === true ? failure.data.stage : null,
    exception: failure?.success === true ? failure.data.exception : null,
    targetProfileId: client.targetProfileId ?? null
  };
}

function sendGatewayMessage(socket: OverlayGatewaySocket, message: OverlayGatewayMessage): void {
  socket.send(JSON.stringify(message));
}
