/** Optional capability supplied only by the isolated desktop management preload. */
export interface DesktopBridge {
  onQuitRequested(listener: (requestId: string) => void): () => void;
  resolveQuit(requestId: string, allow: boolean): void;
}

declare global {
  interface Window { streamJamsDesktop?: DesktopBridge }
}

export function getDesktopBridge(): DesktopBridge | undefined { return window.streamJamsDesktop; }
