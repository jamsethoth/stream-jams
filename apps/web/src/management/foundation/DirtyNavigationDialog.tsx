import { useId } from "react";
import { ModalSurface } from "./ModalSurface.js";

export interface DirtyNavigationDialogProps {
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly open: boolean;
  readonly saveAvailable: boolean;
  readonly summary: string;
}

export function DirtyNavigationDialog(props: DirtyNavigationDialogProps) {
  const titleId = useId();
  return (
    <ModalSurface labelledBy={titleId} onCancel={props.onCancel} open={props.open}>
      <header className="management-modal__header">
        <p className="management-eyebrow">Unsaved changes</p>
        <h2 id={titleId}>Leave with unsaved changes?</h2>
        <p>{props.summary}</p>
      </header>
      {props.error === null ? null : (
        <div className="management-error-banner management-error-banner--error" role="alert">
          <strong>Changes could not be completed.</strong>
          <span>{props.error}</span>
          <span>Resolve the problem or cancel to continue editing.</span>
        </div>
      )}
      <div className="management-modal__actions">
        <button className="button button--secondary" onClick={props.onCancel} type="button">Cancel</button>
        <button className="button button--danger-quiet" onClick={props.onDiscard} type="button">Discard</button>
        {props.saveAvailable ? <button className="button button--primary" onClick={props.onSave} type="button">Save and leave</button> : null}
      </div>
    </ModalSurface>
  );
}
