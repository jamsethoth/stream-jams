import type { MouseEvent } from "react";
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
  return (
    <aside className="management-sidebar">
      <div className="management-brand">
        <h1>Stream Jams</h1>
        <span>Management</span>
      </div>
      <nav aria-label="Primary" className="management-nav">
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
