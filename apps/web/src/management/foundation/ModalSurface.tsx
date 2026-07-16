import { useEffect, useRef, type ReactNode } from "react";

export interface ModalSurfaceProps {
  readonly children: ReactNode;
  readonly labelledBy: string;
  readonly onCancel: () => void;
  readonly open: boolean;
}

export function ModalSurface({ children, labelledBy, onCancel, open }: ModalSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    surfaceRef.current?.querySelector<HTMLElement>("button, input, select, textarea, [href]")?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="management-modal-backdrop">
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="management-modal"
        ref={surfaceRef}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
