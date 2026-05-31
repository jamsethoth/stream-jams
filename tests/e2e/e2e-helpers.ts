import type { Page } from "@playwright/test";

type OverlayPurpose = "live" | "test";
type OverlayScope = "module" | "unified";

interface OverlayComposition {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly modules: readonly OverlayModuleSnapshot[];
}

interface OverlayModuleSnapshot {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly instructions: readonly OverlayInstruction[];
}

interface OverlayInstruction {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly visual: null;
  readonly audio: null;
  readonly text: {
    readonly text: string;
    readonly layout: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly zIndex: number;
    };
  };
  readonly tts: null;
  readonly durationMs: number;
}

export async function mockManagementShell(page: Page): Promise<void> {
  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_e2e" }
    });
  });
  await page.route("**/playback", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        current: null,
        queued: [],
        recent: [],
        paused: false,
        muted: false,
        doNotDisturb: false
      }
    });
  });
  await page.route("**/management/overlay-clients", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: []
    });
  });
  await page.route("**/moderation/settings", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        renderedText: {
          maxLength: 240,
          blockedTerms: [],
          stripUrls: false
        },
        ttsText: {
          maxLength: 180,
          blockedTerms: [],
          stripUrls: true
        }
      }
    });
  });
}

export async function installOverlayWebSocketMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type OverlayMockWindow = Window & {
      __overlaySockets?: EventTarget[];
      __overlaySocketMessages?: unknown[];
    };

    class OverlayTestWebSocket extends EventTarget {
      readonly url: string;
      readyState = 1;

      constructor(url: string) {
        super();
        this.url = url;
        const windowWithMocks = window as OverlayMockWindow;
        windowWithMocks.__overlaySockets ??= [];
        windowWithMocks.__overlaySocketMessages ??= [];
        windowWithMocks.__overlaySockets.push(this);
        setTimeout(() => this.dispatchEvent(new Event("open")), 0);
      }

      send(message: string) {
        const windowWithMocks = window as OverlayMockWindow;
        windowWithMocks.__overlaySocketMessages ??= [];
        windowWithMocks.__overlaySocketMessages.push(JSON.parse(message) as unknown);
      }

      close() {
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: OverlayTestWebSocket
    });
  });
}

export async function sendOverlayPlayback(page: Page, instruction: OverlayInstruction): Promise<void> {
  await page.evaluate((playbackInstruction) => {
    const windowWithMocks = window as Window & { __overlaySockets?: EventTarget[] };
    const sockets = windowWithMocks.__overlaySockets ?? [];
    const socket = sockets[sockets.length - 1];
    if (socket === undefined) {
      throw new Error("Overlay WebSocket mock was not created");
    }

    socket.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "overlay.playback",
          instruction: playbackInstruction
        })
      })
    );
  }, instruction);
}

export function emptyComposition(input: {
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly modules?: readonly OverlayModuleSnapshot[] | undefined;
}): OverlayComposition {
  return {
    overlayId: "default",
    purpose: input.purpose,
    scope: input.scope,
    modules: input.modules ?? []
  };
}

export function textInstruction(input: {
  readonly id: string;
  readonly text: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly moduleId?: string | undefined;
  readonly overlayId?: string | undefined;
}): OverlayInstruction {
  return {
    id: input.id,
    overlayId: input.overlayId ?? "default",
    moduleId: input.moduleId ?? "alerts",
    purpose: input.purpose,
    scope: input.scope,
    visual: null,
    audio: null,
    text: {
      text: input.text,
      layout: {
        x: 40,
        y: 32,
        width: 420,
        height: 96,
        zIndex: 10
      }
    },
    tts: null,
    durationMs: 4000
  };
}
