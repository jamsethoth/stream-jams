import type { MouseEvent } from "react";
import { ThemeSwitcher } from "../foundation/ThemeSwitcher.js";
import {
  managementLegacyRoutes,
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
              <NavigationLink active={activeRoute.id === route.id} onNavigate={onNavigate} route={route} />
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
      <nav aria-label="Legacy tools" className="management-nav management-nav--legacy">
        <p>Legacy tools</p>
        <ul>
          {managementLegacyRoutes.map((route) => (
            <li key={route.id}>
              <NavigationLink active={activeRoute.id === route.id} onNavigate={onNavigate} route={route} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="management-sidebar__footer">
        <ThemeSwitcher />
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
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
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
