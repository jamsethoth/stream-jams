import { useId, useState } from "react";
import { ModalSurface } from "./ModalSurface.js";

export interface DestructiveConfirmationDialogProps {
  readonly actionLabel: string;
  readonly confirmText?: string | undefined;
  readonly consequences: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
  readonly recovery: string | null;
  readonly scope: string;
  readonly title: string;
}

export function DestructiveConfirmationDialog(props: DestructiveConfirmationDialogProps) {
  const titleId = useId();
  const [confirmation, setConfirmation] = useState("");
  const confirmed = props.confirmText === undefined || confirmation === props.confirmText;

  return (
    <ModalSurface labelledBy={titleId} onCancel={props.onCancel} open={props.open}>
      <header className="management-modal__header">
        <p className="management-eyebrow">Confirmation required</p>
        <h2 id={titleId}>{props.title}</h2>
      </header>
      <dl className="management-confirmation-details">
        <div><dt>Affected scope</dt><dd>{props.scope}</dd></div>
        <div><dt>Consequence</dt><dd>{props.consequences}</dd></div>
        {props.recovery === null ? null : <div><dt>Recovery</dt><dd>{props.recovery}</dd></div>}
      </dl>
      {props.confirmText === undefined ? null : (
        <label className="management-field">
          <span>Type {props.confirmText} to confirm</span>
          <input
            autoComplete="off"
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            value={confirmation}
          />
        </label>
      )}
      <div className="management-modal__actions">
        <button className="button button--secondary" onClick={props.onCancel} type="button">Cancel</button>
        <button className="button button--danger" disabled={!confirmed} onClick={props.onConfirm} type="button">
          {props.actionLabel}
        </button>
      </div>
    </ModalSurface>
  );
}
