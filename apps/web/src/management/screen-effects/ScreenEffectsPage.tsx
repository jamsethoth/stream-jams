import {
  duplicateScreenEffect,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { useCallback, useEffect, useState } from "react";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import type {
  ScreenEffectBrowserSource,
  ScreenEffectsApi
} from "./screen-effects-api.js";
import "./screen-effects.css";

export interface ScreenEffectsPageProps {
  readonly api: ScreenEffectsApi;
  readonly onEdit: (effectId: string, create: boolean) => void;
  readonly generateId?: (prefix: string) => string;
}

type Confirmation =
  | { readonly kind: "enable"; readonly document: ScreenEffectDocument }
  | { readonly kind: "delete"; readonly document: ScreenEffectDocument }
  | null;

export function ScreenEffectsPage({ api, onEdit, generateId = defaultId }: ScreenEffectsPageProps) {
  const [documents, setDocuments] = useState<readonly ScreenEffectDocument[]>([]);
  const [browserSources, setBrowserSources] = useState<readonly ScreenEffectBrowserSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedDocuments, loadedSources] = await Promise.all([api.list(), api.listBrowserSources()]);
      setDocuments(loadedDocuments);
      setBrowserSources(loadedSources);
      setError(null);
    } catch (loadError) {
      setError(message(loadError, "Screen Effects could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function copy(document: ScreenEffectDocument) {
    setBusy(true);
    try {
      const copy = duplicateScreenEffect(document, {
        id: generateId("effect"),
        name: `${document.name} copy`,
        variantIds: document.variants.map(() => generateId("variant")),
        bindingIds: document.bindings.map(() => generateId("binding"))
      });
      await api.create(copy);
      setNotice(`${copy.name} was created disabled.`);
      await load();
    } catch (copyError) {
      setError(message(copyError, "The Screen Effect could not be copied."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (confirmation === null) return;
    setBusy(true);
    try {
      if (confirmation.kind === "delete") {
        await api.remove(confirmation.document.id);
        setNotice(`${confirmation.document.name} was deleted.`);
      } else {
        await api.update(
          confirmation.document.id,
          { ...confirmation.document, enabled: !confirmation.document.enabled },
          true
        );
        setNotice(`${confirmation.document.name} is now ${confirmation.document.enabled ? "disabled" : "enabled"}.`);
      }
      setConfirmation(null);
      await load();
    } catch (mutationError) {
      setError(message(mutationError, "The Screen Effect change did not complete."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="screen-effects-page">
    <section aria-labelledby="screen-effects-inventory-title" className="management-card screen-effects-inventory">
      <header className="screen-effects-section-header">
        <div><p className="management-eyebrow">Local module</p><h2 id="screen-effects-inventory-title">Screen Effects</h2><p>Coordinate one visual and one optional sound from trusted stream events.</p></div>
        <button onClick={() => onEdit(generateId("effect"), true)} type="button">New effect</button>
      </header>
      {notice === null ? null : <p role="status">{notice}</p>}
      {error === null ? null : <p role="alert">{error} Retry or open Diagnostics for the server reference.</p>}
      {loading ? <p role="status">Loading Screen Effects…</p> : null}
      {!loading && documents.length === 0 ? <p>No Screen Effects yet. Create a disabled draft, choose media, then save it.</p> : null}
      <ul className="screen-effects-list">
        {documents.map((document) => <li key={document.id}>
          <div>
            <strong>{document.name}</strong>
            <span>{document.category ?? "Uncategorized"} · {document.variants.length} {document.variants.length === 1 ? "variant" : "variants"}</span>
          </div>
          <StatusBadge label={document.enabled ? "Enabled" : "Disabled"} tone={document.enabled ? "positive" : "neutral"} />
          <div className="screen-effects-list__actions">
            <button className="button button--secondary" onClick={() => onEdit(document.id, false)} type="button">Edit</button>
            <button className="button button--secondary" disabled={busy} onClick={() => void copy(document)} type="button">Copy</button>
            <button className="button button--secondary" onClick={() => setConfirmation({ kind: "enable", document })} type="button">{document.enabled ? "Disable" : "Enable"}</button>
            <button className="button button--danger" onClick={() => setConfirmation({ kind: "delete", document })} type="button">Delete</button>
          </div>
          <p><a href="/manage/event-sources">Review trigger setup</a> · {document.bindings.length === 0 ? "No trigger configured" : `${document.bindings.length} configured trigger${document.bindings.length === 1 ? "" : "s"}`}</p>
        </li>)}
      </ul>
    </section>

    <section aria-labelledby="screen-effects-browser-title" className="management-card screen-effects-browser-sources">
      <h2 id="screen-effects-browser-title">Browser sources</h2>
      <p>Screen Effects uses its own module source or an enabled unified source. Keep Browser Source audio separate from visual surface membership.</p>
      {browserSources.length === 0 ? <p>No Screen Effects Browser Source is configured.</p> : <ul>{browserSources.map((source) => <li key={source.id}><strong>{source.label}</strong><span>{source.purpose} · {source.status === "available" ? "ready to copy" : source.status.replace("-", " ")}</span></li>)}</ul>}
      <a href="/manage/modules/alerts#browser-sources">Review Browser Source setup</a>
    </section>

    <ModalSurface labelledBy="screen-effect-confirm-title" onCancel={() => setConfirmation(null)} open={confirmation !== null}>
      {confirmation === null ? null : <div>
        <h2 id="screen-effect-confirm-title">{confirmation.kind === "delete" ? "Delete Screen Effect?" : `${confirmation.document.enabled ? "Disable" : "Enable"} Screen Effect?`}</h2>
        <p>{confirmation.kind === "delete" ? `Delete ${confirmation.document.name} and its saved variants and triggers.` : `This changes live admission for ${confirmation.document.name}. Current and queued occurrences keep their saved snapshots.`}</p>
        <div className="management-modal__actions"><button className="button button--secondary" onClick={() => setConfirmation(null)} type="button">Cancel</button><button disabled={busy} onClick={() => void confirm()} type="button">Confirm change</button></div>
      </div>}
    </ModalSurface>
  </div>;
}

function defaultId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== "" ? error.message : fallback;
}
