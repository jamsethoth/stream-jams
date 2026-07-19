import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { DirtyNavigationDialog } from "../foundation/DirtyNavigationDialog.js";
import {
  formatManagementRoute,
  parseManagementRoute,
  type ManagementRoute
} from "../routing/management-route.js";

export interface DirtyNavigationSource {
  readonly id: string;
  readonly summary: string;
  readonly save: (() => Promise<boolean | void> | boolean | void) | null;
  readonly discard: () => Promise<void> | void;
}

interface DirtyNavigationContextValue {
  readonly source: DirtyNavigationSource | null;
  readonly register: (source: DirtyNavigationSource) => void;
  readonly unregister: (id: string) => void;
}

const DirtyNavigationContext = createContext<DirtyNavigationContextValue | null>(null);

export function DirtyNavigationProvider({ children }: { readonly children: ReactNode }) {
  const [source, setSource] = useState<DirtyNavigationSource | null>(null);
  const register = useCallback((nextSource: DirtyNavigationSource) => setSource(nextSource), []);
  const unregister = useCallback((id: string) => {
    setSource((current) => (current?.id === id ? null : current));
  }, []);
  const value = useMemo(() => ({ source, register, unregister }), [register, source, unregister]);

  return <DirtyNavigationContext.Provider value={value}>{children}</DirtyNavigationContext.Provider>;
}

export interface DirtyNavigationRegistrationOptions extends DirtyNavigationSource {
  readonly dirty: boolean;
}

export function useDirtyNavigationSource(options: DirtyNavigationRegistrationOptions): void {
  const context = useContext(DirtyNavigationContext);
  const register = context?.register;
  const unregister = context?.unregister;

  useEffect(() => {
    if (register === undefined || unregister === undefined || !options.dirty) {
      unregister?.(options.id);
      return;
    }

    register({
      id: options.id,
      summary: options.summary,
      save: options.save,
      discard: options.discard
    });
    return () => unregister(options.id);
  }, [options.dirty, options.discard, options.id, options.save, options.summary, register, unregister]);
}

interface PendingNavigation {
  readonly route: ManagementRoute;
  readonly mode: "push" | "replace";
}

export function useManagementNavigation() {
  const context = useContext(DirtyNavigationContext);
  if (context === null) {
    throw new Error("useManagementNavigation must be used inside DirtyNavigationProvider");
  }

  const [route, setRoute] = useState<ManagementRoute>(() => parseManagementRoute(`${window.location.pathname}${window.location.search}`));
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [guardError, setGuardError] = useState<string | null>(null);

  const commit = useCallback((nextRoute: ManagementRoute, mode: PendingNavigation["mode"]) => {
    const path = formatManagementRoute(nextRoute);
    if (mode === "replace") {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
  }, []);

  const requestNavigation = useCallback(
    (nextRoute: ManagementRoute) => {
      if (formatManagementRoute(nextRoute) === formatManagementRoute(route)) {
        return;
      }
      if (context.source !== null) {
        setGuardError(null);
        setPending({ route: nextRoute, mode: "push" });
        return;
      }
      commit(nextRoute, "push");
    },
    [commit, context.source, route]
  );

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = parseManagementRoute(`${window.location.pathname}${window.location.search}`);
      if (formatManagementRoute(nextRoute) === formatManagementRoute(route)) {
        return;
      }
      if (context.source !== null) {
        window.history.pushState(null, "", formatManagementRoute(route));
        setGuardError(null);
        setPending({ route: nextRoute, mode: "replace" });
        return;
      }
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [context.source, route]);

  useEffect(() => {
    if (context.source === null) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [context.source]);

  const finishPending = useCallback(() => {
    if (pending === null) {
      return;
    }
    const sourceId = context.source?.id;
    if (sourceId !== undefined) {
      context.unregister(sourceId);
    }
    commit(pending.route, pending.mode);
    setPending(null);
    setGuardError(null);
  }, [commit, context, pending]);

  const saveAndLeave = useCallback(async () => {
    try {
      const saved = await context.source?.save?.();
      if (saved === false) {
        return;
      }
      finishPending();
    } catch (error) {
      setGuardError(error instanceof Error ? error.message : "Unable to save changes before leaving.");
    }
  }, [context.source, finishPending]);

  const discardAndLeave = useCallback(async () => {
    try {
      await context.source?.discard();
      finishPending();
    } catch (error) {
      setGuardError(error instanceof Error ? error.message : "Unable to discard changes before leaving.");
    }
  }, [context.source, finishPending]);

  const guard = (
    <DirtyNavigationDialog
      error={guardError}
      onCancel={() => {
        setPending(null);
        setGuardError(null);
      }}
      onDiscard={() => void discardAndLeave()}
      onSave={() => void saveAndLeave()}
      open={pending !== null}
      saveAvailable={context.source?.save !== null && context.source?.save !== undefined}
      summary={context.source?.summary ?? "This page has unsaved changes."}
    />
  );

  return { route, requestNavigation, guard } as const;
}
