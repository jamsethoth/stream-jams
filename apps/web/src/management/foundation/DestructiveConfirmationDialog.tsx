import { Button, TextInput } from "@mantine/core";
import type { ActionableManagementError } from "@stream-jams/core";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "./ManagementModalSurface.js";

export interface DestructiveConfirmationDialogProps {
  readonly actionLabel: string;
  readonly confirmText?: string | undefined;
  readonly consequences: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly open: boolean;
  readonly recovery: string | null;
  readonly scope: string;
  readonly title: string;
  /** Owner-rendered impact facts; pending owners must remove navigable links. */
  readonly details?: ReactNode;
  readonly targetId?: string;
  readonly pending?: boolean;
  readonly error?: ActionableManagementError | null;
  /** Only enable when onCancel actually aborts the operation. */
  readonly cancelWhilePending?: boolean;
  readonly restoreFocusFallbackRef?: RefObject<HTMLElement | null>;
}

export function DestructiveConfirmationDialog(props: DestructiveConfirmationDialogProps) {
  const titleId = useId();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // Workflow owns failure reporting and also guards its mutation directly.
  async function confirm() {
    if (inFlight.current || props.pending) return;
    inFlight.current = true;
    setSubmitting(true);
    try { await props.onConfirm(); }
    finally { inFlight.current = false; setSubmitting(false); }
  }
  return (
    <ModalSurface labelledBy={titleId} onCancel={props.onCancel} open={props.open} pending={(submitting || (props.pending ?? false)) && !props.cancelWhilePending} {...(props.restoreFocusFallbackRef === undefined ? {} : { restoreFocusFallbackRef: props.restoreFocusFallbackRef })}>
      <ConfirmationContent key={JSON.stringify([props.open, props.targetId ?? props.scope, props.confirmText])} {...props} pending={submitting || (props.pending ?? false)} onConfirm={confirm} />
    </ModalSurface>
  );
}

function ConfirmationContent(props: DestructiveConfirmationDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  // A reopened or newly targeted dialog must not inherit the previous failure.
  const initialError = useRef(props.error);
  const pending = props.pending ?? false;
  const confirmed = props.confirmText === undefined || confirmation === props.confirmText;
  return <>
      <header className="management-modal__header">
        <p className="management-eyebrow">Confirmation required</p>
        <ManagementModalTitle>{props.title}</ManagementModalTitle>
      </header>
      <dl className="management-confirmation-details">
        <div><dt>Affected scope</dt><dd>{props.scope}</dd></div>
        <div><dt>Consequence</dt><dd>{props.consequences}</dd></div>
        {props.recovery === null ? null : <div><dt>Recovery</dt><dd>{props.recovery}</dd></div>}
      </dl>
      {props.details}
      {props.confirmText === undefined ? null : (
          <TextInput
            label={`Type ${props.confirmText} to confirm`}
            disabled={pending}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            value={confirmation}
          />
      )}
      {pending || props.error == null || props.error === initialError.current ? null : <ManagementErrorBanner error={props.error} />}
      <div className="management-modal__actions">
        <Button variant="default" disabled={pending && !props.cancelWhilePending} onClick={props.onCancel}>Cancel</Button>
        <Button color="red" disabled={!confirmed || pending} loading={pending} onClick={() => { if (confirmed && !pending) { initialError.current = undefined; void props.onConfirm(); } }}>
          {props.actionLabel}
        </Button>
      </div>
    </>;
}
