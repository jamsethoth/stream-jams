import { useId } from "react";
import { Button } from "@mantine/core";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "./ManagementModalSurface.js";

export interface DirtyNavigationDialogProps {
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly open: boolean;
  readonly saveAvailable: boolean;
  readonly saveLabel?: string;
  readonly summary: string;
  readonly title?: string;
  readonly pending?: boolean;
}

export function DirtyNavigationDialog(props: DirtyNavigationDialogProps) {
  const titleId = useId();
  return (
    <ModalSurface labelledBy={titleId} onCancel={props.onCancel} open={props.open} pending={props.pending ?? false}>
      <header className="management-modal__header">
        <p className="management-eyebrow">Unsaved changes</p>
        <ManagementModalTitle>{props.title ?? "Leave with unsaved changes?"}</ManagementModalTitle>
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
        <Button variant="default" disabled={props.pending ?? false} onClick={props.onCancel}>Cancel</Button>
        <Button variant="light" color="red" disabled={props.pending ?? false} onClick={props.onDiscard}>Discard</Button>
        {props.saveAvailable ? <Button disabled={props.pending ?? false} loading={props.pending ?? false} onClick={props.onSave}>{props.saveLabel ?? "Save and leave"}</Button> : null}
      </div>
    </ModalSurface>
  );
}
