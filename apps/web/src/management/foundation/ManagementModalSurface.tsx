import { Modal } from "@mantine/core";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import type { ModalSurfaceProps } from "./ModalSurface.js";

export interface ManagementModalSurfaceProps extends ModalSurfaceProps {
  readonly pending?: boolean;
}
// Title registers the accessible name with Mantine. Existing caller headers and
// content stay owned by their workflow; Management and Operator share this surface.
export function ManagementModalTitle({ children, ...props }: { readonly children: ReactNode; readonly ref?: Ref<HTMLHeadingElement>; readonly tabIndex?: number }) {
  return <Modal.Title {...props}>{children}</Modal.Title>;
}
export function ManagementModalSurface({ children, labelledBy, onCancel, open, pending = false, restoreFocusFallbackRef }: ManagementModalSurfaceProps) {
  const trigger = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    if (open) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  function restoreFocus() {
    if (openRef.current) return;
    const target = trigger.current?.isConnected && !trigger.current.matches(":disabled") ? trigger.current : restoreFocusFallbackRef?.current;
    target?.focus();
    trigger.current = null;
  }
  useEffect(() => () => {
    if (trigger.current === null) return;
    const target = trigger.current?.isConnected && !trigger.current.matches(":disabled") ? trigger.current : restoreFocusFallbackRef?.current;
    target?.focus();
  }, [restoreFocusFallbackRef]);
  return <Modal.Root id={labelledBy} opened={open} onClose={() => { if (!pending) onCancel(); }} closeOnEscape={!pending} closeOnClickOutside={false} returnFocus={false} transitionProps={{ duration: 0 }} onExitTransitionEnd={restoreFocus} size={560} centered zIndex={1000}>
    <Modal.Overlay backgroundOpacity={0.62} />
    <Modal.Content className="management-mantine-modal" aria-busy={pending || undefined}>
      <Modal.Body className="management-mantine-modal__body">{children}</Modal.Body>
    </Modal.Content>
  </Modal.Root>;
}
