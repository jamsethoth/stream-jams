export function closeAction(closeToTray: boolean, explicitQuit: boolean): "hide" | "quit" {
  return closeToTray && !explicitQuit ? "hide" : "quit";
}

export function isManagementNavigation(candidate: string, origin: string): boolean {
  try {
    const url = new URL(candidate);
    return url.origin === origin && !url.username && !url.password &&
      (url.pathname === "/manage" || url.pathname.startsWith("/manage/") || url.pathname === "/operator");
  } catch { return false; }
}

export function isTrustedManagementSender(input: {
  readonly senderId: number; readonly expectedId: number;
  readonly isMainFrame: boolean; readonly url: string; readonly origin: string;
}): boolean {
  return input.senderId === input.expectedId && input.isMainFrame && isManagementNavigation(input.url, input.origin);
}
