import { randomUUID } from "node:crypto";
import type {
  AlertBrowserSourceView,
  AudioOutputStatus,
  DesktopOverlayStatus,
  DesktopOverlayTransport,
  Logger,
  OverlayOutputView,
  SurfaceConfiguration,
  TargetProfileId
} from "@stream-jams/core";
import type { OverlayGatewayClientState } from "../../websocket/overlay-gateway.js";

export interface OutputReadinessServiceOptions {
  readonly getClientStates: () => readonly OverlayGatewayClientState[];
  readonly listOutputs: (origin: string) => Promise<readonly OverlayOutputView[]>;
  readonly listSurfaces: () => Promise<readonly SurfaceConfiguration[]>;
  readonly desktopHost?: Pick<DesktopOverlayTransport, "getStatus"> | undefined;
  readonly getAudioStatus: () => Promise<AudioOutputStatus>;
  readonly logger?: Logger;
  readonly generateReferenceId?: () => string;
}

export class OutputReadinessService {
  readonly #desktopSignatures = new Map<string, string>();
  constructor(private readonly options: OutputReadinessServiceOptions) {}

  isModuleBrowserSourceConnected(moduleId: string, targetProfileId: TargetProfileId | null): boolean {
    return this.options.getClientStates().some(
      (client) => client.connectionState === "connected"
        && client.overlayId === "default"
        && client.purpose === "live"
        && client.scope === "module"
        && client.moduleId === moduleId
        && (client.targetProfileId ?? null) === targetProfileId
    );
  }

  isUnifiedBrowserSourceConnected(): boolean {
    return this.options.getClientStates().some(
      (client) => client.connectionState === "connected"
        && client.overlayId === "default"
        && client.purpose === "live"
        && client.scope === "unified"
        && client.moduleId === null
        && (client.targetProfileId ?? null) === null
    );
  }

  async listAlertBrowserSources(origin: string): Promise<readonly AlertBrowserSourceView[]> {
    const outputs = await this.options.listOutputs(origin);
    return outputs
      .filter(isAlertLiveBrowserOutput)
      .map((output) => {
        const states = this.options.getClientStates()
          .filter((client) => sameOutput(client, output))
          .sort((left, right) => right.connectedAt.localeCompare(left.connectedAt));
        const connected = states.some((client) => client.connectionState === "connected");
        const latest = states[0] ?? null;
        return {
          id: output.id,
          targetProfileId: output.targetProfileId,
          purpose: "live" as const,
          connectionState: connected ? "connected" as const : latest === null ? "never-connected" as const : "disconnected" as const,
          lastConnectedAt: latest?.connectedAt ?? null,
          keyId: output.keyId,
          url: output.url,
          copyableUrlStatus: output.copyableUrlStatus
        };
      });
  }

  async listTimerBrowserSources(origin: string) {
    const outputs = await this.options.listOutputs(origin);
    return outputs
      .filter((output) => output.scope === "module"
        && output.moduleId === "timers"
        && output.purpose === "live"
        && (output.targetProfileId === "landscape" || output.targetProfileId === "vertical"))
      .map((output) => {
        const states = this.options.getClientStates()
          .filter((client) => sameOutput(client, output))
          .sort((left, right) => right.connectedAt.localeCompare(left.connectedAt));
        const connected = states.some((client) => client.connectionState === "connected");
        const latest = states[0] ?? null;
        return {
          ...output,
          connectionState: connected ? "connected" as const : latest === null ? "never-connected" as const : "disconnected" as const,
          lastConnectedAt: latest?.connectedAt ?? null
        };
      });
  }

  async hasConfiguredAlertBrowserOutput(origin: string): Promise<boolean> {
    return (await this.options.listOutputs(origin)).some(
      (output) => isAlertLiveBrowserOutput(output) && output.copyableUrlStatus === "available"
    );
  }

  async isBrowserOutputReady(input: {
    readonly moduleId: string;
    readonly hasVisual: boolean;
    readonly hasAudio: boolean;
    readonly targetProfileId: TargetProfileId | null;
  }): Promise<boolean> {
    const moduleConnected = this.isModuleBrowserSourceConnected(input.moduleId, input.targetProfileId);
    const unifiedConnected = input.targetProfileId === null && this.isUnifiedBrowserSourceConnected();
    let unifiedVisualEnabled = false;
    if (input.hasVisual && unifiedConnected) {
      try {
        const surface = (await this.options.listSurfaces()).find(
          (candidate) => candidate.kind === "unified-browser" && candidate.overlayId === "default"
        );
        unifiedVisualEnabled = surface?.layers.some(
          (layer) => layer.moduleId === input.moduleId && layer.visible
        ) ?? false;
      }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch {
        unifiedVisualEnabled = false;
      }
    }

    const visualReady = input.hasVisual && (moduleConnected || (unifiedConnected && unifiedVisualEnabled));
    const audioReady = input.hasAudio && (moduleConnected || unifiedConnected);
    return visualReady || audioReady;
  }

  async isDesktopVisualReady(moduleId: string): Promise<boolean> {
    const desktopHost = this.options.desktopHost;
    if (desktopHost === undefined) return false;
    try {
      const surface = (await this.options.listSurfaces()).find(
        (candidate) => candidate.kind === "desktop"
      );
      if (surface?.kind !== "desktop"
        || !surface.enabled
        || surface.displayId === null
        || !surface.layers.some((layer) => layer.moduleId === moduleId && layer.visible)) {
        return false;
      }
      if (desktopHost.getStatus === undefined) return true;
      const status = await desktopHost.getStatus();
      const ready = status.available
        && status.state === "ready"
        && status.displays.some((display) => display.id === surface.displayId);
      if (!ready) {
        await this.#logDesktopUnavailable(moduleId, status, surface.displayId);
      } else if (this.#desktopSignatures.has(moduleId)) {
        const logged = await this.#log("info", "Desktop overlay readiness recovered.", "desktop-overlay.readiness.recovered", {
          moduleId,
          hostState: status.state,
          displayCount: status.displays.length,
          selectedDisplayAvailable: true,
          nextStep: "Test the desktop overlay to confirm playback."
        });
        if (logged) this.#desktopSignatures.delete(moduleId);
      }
      return ready;
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}:${error.message}`.slice(0, 256) : "UnknownError";
      const signature = `status-error:${reason}`;
      if (this.#desktopSignatures.get(moduleId) !== signature) {
        const logged = await this.#log("warn", "Desktop overlay readiness could not be inspected.", "desktop-overlay.readiness.failed", {
          moduleId,
          error: reason,
          nextStep: "Restart the Windows desktop app and test the desktop overlay again."
        });
        if (logged) this.#desktopSignatures.set(moduleId, signature);
      }
      return false;
    }
  }

  async #logDesktopUnavailable(moduleId: string, status: DesktopOverlayStatus, displayId: string): Promise<void> {
    const diagnostic = status.diagnostic ?? null;
    const selectedDisplayAvailable = status.displays.some(display => display.id === displayId);
    const signature = JSON.stringify([status.state, status.message, selectedDisplayAvailable, diagnostic]);
    if (this.#desktopSignatures.get(moduleId) === signature) return;
    const logged = await this.#log("warn", "Desktop overlay is not ready for visual output.", "desktop-overlay.readiness.unavailable", {
      moduleId,
      hostState: status.state,
      hostMessage: status.message,
      displayCount: status.displays.length,
      selectedDisplayAvailable,
      failureKind: diagnostic?.kind ?? null,
      failureOperation: diagnostic?.operation ?? null,
      failureReason: diagnostic?.reason ?? null,
      failureExitCode: diagnostic?.exitCode ?? null,
      failureOccurredAt: diagnostic?.occurredAt ?? null,
      consecutiveFailures: diagnostic?.consecutiveFailures ?? 0,
      nextStep: "Open Settings and retry the desktop overlay. Interrupted content is not replayed."
    });
    if (logged) this.#desktopSignatures.set(moduleId, signature);
  }

  async #log(level: "info" | "warn", message: string, source: string, metadata: Record<string, unknown>): Promise<boolean> {
    const logger = this.options.logger;
    if (logger === undefined) return false;
    try {
      await logger[level](message, {
        module: "overlay-readiness",
        source,
        correlationId: (this.options.generateReferenceId ?? randomUUID)(),
        processingId: null,
        metadata
      });
      return true;
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch { return false; }
  }

  async hasReadyAudioRoute(routeIds: readonly string[]): Promise<boolean> {
    if (routeIds.length === 0) return false;
    try {
      const selected = new Set(routeIds);
      const status = await this.options.getAudioStatus();
      return status.routes.some((route) => selected.has(route.route.id) && route.state === "ready");
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      return false;
    }
  }
}

function isAlertLiveBrowserOutput(
  output: OverlayOutputView
): output is OverlayOutputView & { readonly targetProfileId: TargetProfileId } {
  return output.scope === "module"
    && output.moduleId === "alerts"
    && output.purpose === "live"
    && (output.targetProfileId === "landscape" || output.targetProfileId === "vertical");
}

function sameOutput(client: OverlayGatewayClientState, output: OverlayOutputView): boolean {
  return client.scope === output.scope
    && client.moduleId === output.moduleId
    && client.overlayId === output.overlayId
    && client.purpose === output.purpose
    && (client.targetProfileId ?? null) === (output.targetProfileId ?? null);
}
