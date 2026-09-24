import type {
  AlertBrowserSourceView,
  AudioOutputStatus,
  DesktopOverlayTransport,
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
}

export class OutputReadinessService {
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
      } catch {
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
      return status.available
        && status.state === "ready"
        && status.displays.some((display) => display.id === surface.displayId);
    } catch {
      return false;
    }
  }

  async hasReadyAudioRoute(routeIds: readonly string[]): Promise<boolean> {
    if (routeIds.length === 0) return false;
    try {
      const selected = new Set(routeIds);
      const status = await this.options.getAudioStatus();
      return status.routes.some((route) => selected.has(route.route.id) && route.state === "ready");
    } catch {
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
