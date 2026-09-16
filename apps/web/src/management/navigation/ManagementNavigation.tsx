import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  managementPrimaryRoutes,
  type ManagementRoute,
  type ManagementRouteDefinition
} from "../routing/management-route.js";

export interface ManagementNavigationProps {
  readonly activeRoute: ManagementRoute;
  readonly onNavigate: (route: ManagementRoute) => void;
}

export function ManagementNavigation({ activeRoute, onNavigate }: ManagementNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeLabel = findRouteLabel(activeRoute.id) ?? "Management";

  useEffect(() => {
    setMobileOpen(false);
  }, [activeRoute.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !mobileOpen) return;
    event.preventDefault();
    setMobileOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <aside className="management-sidebar" onKeyDown={handleKeyDown}>
      <div className="management-brand">
        <div><h1>Stream Jams</h1><span className="management-brand__current">{activeLabel}</span></div>
        <button
          aria-controls="management-primary-navigation"
          aria-expanded={mobileOpen}
          aria-label="Navigation"
          className="management-nav__trigger"
          onClick={() => setMobileOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          Menu
        </button>
      </div>
      <nav aria-label="Primary" className={`management-nav${mobileOpen ? " management-nav--mobile-open" : ""}`} id="management-primary-navigation">
        <ul>
          {managementPrimaryRoutes.map((route) => (
            <li key={route.id}>
              {route.childRoutes.length === 0 ? (
                <NavigationLink active={activeRoute.id === route.id} onNavigate={onNavigate} route={route} />
              ) : (
                <span className="management-nav__group">{route.label}</span>
              )}
              {route.childRoutes.length === 0 ? null : (
                <ul className="management-nav__children">
                  {route.childRoutes.map((child) => (
                    <li key={child.id}>
                      <NavigationLink active={activeRoute.id === child.id} onNavigate={onNavigate} route={child} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="management-sidebar__footer">
        <span className="management-local-status"><span aria-hidden="true" /> Local only</span>
      </div>
    </aside>
  );
}

function findRouteLabel(routeId: ManagementRoute["id"]): string | null {
  for (const route of managementPrimaryRoutes) {
    if (route.id === routeId) return route.label;
    const child = route.childRoutes.find(({ id }) => id === routeId);
    if (child !== undefined) return child.label;
  }
  return null;
}

function NavigationLink({
  active,
  onNavigate,
  route
}: {
  readonly active: boolean;
  readonly onNavigate: (route: ManagementRoute) => void;
  readonly route: ManagementRouteDefinition;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onNavigate({ id: route.id });
  }

  return (
    <a aria-current={active ? "page" : undefined} href={route.path} onClick={handleClick}>
      {route.label}
    </a>
  );
}
