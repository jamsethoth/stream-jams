import { Button } from "@mantine/core";
import type { PearCertificateReview } from "@stream-jams/core";
import { useId } from "react";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";

export interface PearCertificateDialogProps {
  readonly baseUrl: string;
  readonly certificate: PearCertificateReview | null;
  readonly pending: boolean;
  readonly onAccept: (sha256: string) => void;
  readonly onCancel: () => void;
}

/** Explicit consent before Stream Jams trusts a Pear certificate that no trusted authority signed. */
export function PearCertificateDialog({ baseUrl, certificate, pending, onAccept, onCancel }: PearCertificateDialogProps) {
  const titleId = useId();
  return <ManagementModalSurface labelledBy={titleId} open={certificate !== null} pending={pending} onCancel={onCancel}>
    {certificate === null ? null : <>
      <header className="management-modal__header">
        <p className="management-eyebrow">Confirmation required</p>
        <ManagementModalTitle>{certificate.replacesTrusted ? "Pear Desktop's certificate changed" : "Trust Pear Desktop's certificate?"}</ManagementModalTitle>
      </header>
      <p>
        {certificate.replacesTrusted
          ? `Pear Desktop at ${baseUrl} now presents a different self-signed certificate from the one you accepted before. Continue only if you regenerated or replaced Pear's certificate.`
          : `Pear Desktop at ${baseUrl} uses a self-signed certificate that no trusted authority has verified.`}
        {" "}Stream Jams will trust only this exact certificate for this source, and will ask again if it changes.
      </p>
      <dl className="management-confirmation-details pear-certificate-dialog__details">
        <div><dt>SHA-256 fingerprint</dt><dd><code>{certificate.sha256}</code></dd></div>
        <div><dt>Issued to</dt><dd>{certificate.subject}</dd></div>
        <div><dt>Issued by</dt><dd>{certificate.issuer}</dd></div>
        <div><dt>Valid</dt><dd>{certificate.validFrom} to {certificate.validTo}</dd></div>
      </dl>
      <div className="management-modal__actions">
        <Button variant="default" disabled={pending} onClick={onCancel}>Cancel pairing</Button>
        <Button loading={pending} disabled={pending} onClick={() => onAccept(certificate.sha256)}>Trust certificate and pair</Button>
      </div>
    </>}
  </ManagementModalSurface>;
}
