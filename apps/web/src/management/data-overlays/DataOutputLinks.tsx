import { Button, Group } from "@mantine/core";
import { useRef, useState } from "react";
import type { OverlayOutputView } from "@stream-jams/core";
import type { ManagementApi } from "../management-api.js";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { message } from "./DataPage.js";
export function DataOutputLinks({ outputs, api, onChanged }: {
    readonly outputs: readonly OverlayOutputView[];
    readonly api: ManagementApi;
    readonly onChanged: () => Promise<void>;
}) {
    const [revealed, setRevealed] = useState<string[]>([]);
    const [review, setReview] = useState<OverlayOutputView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    async function mutate(output: OverlayOutputView, regenerate: boolean) {
        if (pending.current)
            return;
        pending.current = true;
        setBusy(true);
        setError(null);
        try {
            const input = { overlayId: output.overlayId, purpose: output.purpose, scope: output.scope, moduleId: output.moduleId, targetProfileId: output.targetProfileId };
            await (regenerate ? api.regenerateOverlayOutputKey(input) : api.createOverlayOutputKey(input));
            await onChanged();
            setReview(null);
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return <>{review === null && error !== null ? <p role="alert">{error}</p> : null}{outputs.map(output => <BrowserSourceRow key={output.id} label={output.label} ready={output.copyableUrlStatus === "available"} metadata={output.targetProfileId === "vertical" ? "1080 × 1920" : "1920 × 1080"} telemetry={output.purpose === "live" ? "Live output" : "Test output"} guidance="Add a Browser Source in OBS using these dimensions. Canvas assignments determine which layouts appear." url={output.url === null ? <p>Create a URL to configure this source.</p> : revealed.includes(output.id) ? <TextUrl label={`${output.label} source URL`} url={output.url}/> : <span>URL hidden</span>} actions={<>
    {output.copyableUrlStatus === "create-required" ? <Button variant="default" disabled={busy} onClick={() => void mutate(output, false)}>Create {output.label} URL</Button> : <Button color="red" variant="light" disabled={busy} onClick={() => { setError(null); setReview(output); }}>Regenerate {output.label} URL</Button>}
    {output.url === null ? null : <>
      <Button variant="default" disabled={busy} onClick={() => setRevealed(current => current.includes(output.id) ? current.filter(id => id !== output.id) : [...current, output.id])}>{revealed.includes(output.id) ? "Hide" : "Reveal"} {output.label} URL</Button>
      <Button variant="default" onClick={() => { void navigator.clipboard.writeText(output.url!).catch((cause: unknown) => setError(`Copy failed: ${message(cause)} Reveal the URL and copy it manually.`)); }}>Copy {output.label} URL</Button>
    </>}
  </>}/>)}{outputs.length === 0 ? <p>No Data Overlays outputs returned. Reload the page after checking the local service.</p> : null}<ManagementModalSurface labelledBy="data-output-regenerate" open={review !== null} pending={busy} onCancel={() => { setReview(null); setError(null); }}>
      <ManagementModalTitle>Regenerate {review?.label} URL?</ManagementModalTitle>
      <p>The old URL stops working. Update each Browser Source using it after regeneration.</p>{error === null ? null : <p role="alert">{error}</p>}<Group>
        <Button color="red" disabled={busy} onClick={() => { if (review)
        void mutate(review, true); }}>Confirm regenerate</Button>
        <Button variant="default" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
      </Group>
    </ManagementModalSurface>
  </>;
}
function TextUrl({ label, url }: {
    readonly label: string;
    readonly url: string;
}) { return <input aria-label={label} readOnly value={url}/>; }
