export type WebRouteShell = "management" | "operator" | "overlay";

export function resolveWebRouteShell(pathname: string): WebRouteShell {
  if (pathname === "/operator" || pathname === "/operator/") return "operator";
  if (pathname.startsWith("/overlay/")) return "overlay";
  return "management";
}
