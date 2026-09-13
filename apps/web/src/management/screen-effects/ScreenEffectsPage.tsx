import {
  duplicateScreenEffect,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { useCallback, useEffect, useState } from "react";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { MaskedValue } from "../foundation/MaskedValue.js";
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
  | { readonly kind: "effect-enable"; readonly document: ScreenEffectDocument }
  | { readonly kind: "delete"; readonly document: ScreenEffectDocument }
  | { readonly kind: "module"; readonly enabled: boolean }
  | { readonly kind: "regenerate"; readonly source: ScreenEffectBrowserSource }
  | null;

export function ScreenEffectsPage({ api, onEdit, generateId = defaultId }: ScreenEffectsPageProps) {
  const [documents, setDocuments] = useState<readonly ScreenEffectDocument[]>([]);
  const [browserSources, setBrowserSources] = useState<readonly ScreenEffectBrowserSource[]>([]);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedDocuments, loadedSources, loadedModuleEnabled] = await Promise.all([
        api.list(),
        api.listBrowserSources(),
        api.getModuleEnabled()
      ]);
      setDocuments(loadedDocuments);
      setBrowserSources(loadedSources);
      setModuleEnabled(loadedModuleEnabled);
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
    setError(null);
    try {
      if (confirmation.kind === "module") {
        await api.setModuleEnabled(confirmation.enabled);
        setNotice(`Screen Effects module is now ${confirmation.enabled ? "enabled" : "disabled"}.`);
      } else if (confirmation.kind === "regenerate") {
        await api.regenerateBrowserSource(confirmation.source);
        setNotice(`${confirmation.source.label} URL was regenerated. Update every browser source that used the old URL.`);
        setRegenerateConfirmation("");
      } else if (confirmation.kind === "delete") {
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

  async function createBrowserSource(source: ScreenEffectBrowserSource) {
    setBusy(true);
    setError(null);
    try {
      await api.createBrowserSource(source);
      setNotice(`${source.label} URL was created.`);
      await load();
    } catch (mutationError) {
      setError(message(mutationError, "The Screen Effects Browser Source URL was not created."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="screen-effects-page">
    <section aria-labelledby="screen-effects-inventory-title" className="management-card screen-effects-inventory">
      <header className="screen-effects-section-header">
        <div><p className="management-eyebrow">Local module</p><h2 id="screen-effects-inventory-title">Screen Effects</h2><p>Coordinate one visual and one optional sound from trusted stream events.</p>{moduleEnabled === null ? null : <StatusBadge label={moduleEnabled ? "Module enabled" : "Module disabled"} tone={moduleEnabled ? "positive" : "neutral"} />}</div>
        <div className="screen-effects-list__actions"><button className="button button--secondary" disabled={busy || moduleEnabled === null} onClick={() => setConfirmation({ kind: "module", enabled: !moduleEnabled })} type="button">{moduleEnabled ? "Disable Screen Effects module" : "Enable Screen Effects module"}</button><button onClick={() => onEdit(generateId("effect"), true)} type="button">New effect</button></div>
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
            <button className="button button--secondary" onClick={() => setConfirmation({ kind: "effect-enable", document })} type="button">{document.enabled ? "Disable" : "Enable"}</button>
            <button className="button button--danger" onClick={() => setConfirmation({ kind: "delete", document })} type="button">Delete</button>
          </div>
          <p><a href="/manage/event-sources">Review trigger setup</a> · {document.bindings.length === 0 ? "No trigger configured" : `${document.bindings.length} configured trigger${document.bindings.length === 1 ? "" : "s"}`}</p>
        </li>)}
      </ul>
    </section>

    <section aria-labelledby="screen-effects-browser-title" className="management-card screen-effects-browser-sources">
      <h2 id="screen-effects-browser-title">Browser sources</h2>
      <p>Screen Effects uses its own module source or an enabled unified source. Keep Browser Source audio separate from visual surface membership.</p>
      {browserSources.length === 0 ? <p>No Screen Effects Browser Source output is registered.</p> : <ul>{browserSources.map((source) => <li key={source.id}><div><strong>{source.label}</strong><span>{source.purpose} · {source.status === "available" ? "URL available" : source.status.replace("-", " ")}</span></div>{source.url === null ? null : <MaskedValue label={`${source.label} Browser Source URL`} value={source.url} />}<div className="screen-effects-list__actions">{source.status === "create-required" ? <button disabled={busy} onClick={() => void createBrowserSource(source)} type="button">Create URL</button> : <button className="button button--danger" disabled={busy} onClick={() => { setRegenerateConfirmation(""); setConfirmation({ kind: "regenerate", source }); }} type="button">Regenerate URL</button>}</div></li>)}</ul>}
    </section>

    <ModalSurface labelledBy="screen-effect-confirm-title" onCancel={() => setConfirmation(null)} open={confirmation !== null}>
      {confirmation === null ? null : <div>
        <h2 id="screen-effect-confirm-title">{confirmationTitle(confirmation)}</h2>
        <p>{confirmationMessage(confirmation)}</p>
        {confirmation.kind === "regenerate" ? <label><span>Type REGENERATE to continue</span><input autoComplete="off" onChange={(event) => setRegenerateConfirmation(event.currentTarget.value)} value={regenerateConfirmation} /></label> : null}
        <div className="management-modal__actions"><button className="button button--secondary" onClick={() => { setConfirmation(null); setRegenerateConfirmation(""); }} type="button">Cancel</button><button className={confirmation.kind === "delete" || confirmation.kind === "regenerate" ? "button button--danger" : undefined} disabled={busy || (confirmation.kind === "regenerate" && regenerateConfirmation !== "REGENERATE")} onClick={() => void confirm()} type="button">{confirmation.kind === "regenerate" ? "Regenerate URL" : "Confirm change"}</button></div>
      </div>}
    </ModalSurface>
  </div>;
}

function confirmationTitle(confirmation: Exclude<Confirmation, null>): string {
  if (confirmation.kind === "delete") return "Delete Screen Effect?";
  if (confirmation.kind === "regenerate") return `Regenerate ${confirmation.source.label} URL?`;
  if (confirmation.kind === "module") return `${confirmation.enabled ? "Enable" : "Disable"} Screen Effects module?`;
  return `${confirmation.document.enabled ? "Disable" : "Enable"} Screen Effect?`;
}

function confirmationMessage(confirmation: Exclude<Confirmation, null>): string {
  if (confirmation.kind === "delete") {
    return `Delete ${confirmation.document.name} and its saved variants and triggers.`;
  }
  if (confirmation.kind === "regenerate") {
    return "The current URL will stop working immediately. Update every browser source that uses it.";
  }
  if (confirmation.kind === "module") {
    return confirmation.enabled
      ? "Enabled Screen Effects may accept trusted live events. Individual effects remain independently controlled."
      : "Disabling the module stops its current occurrence and clears its pending queue. Saved effects remain available.";
  }
  return `This changes live admission for ${confirmation.document.name}. Current and queued occurrences keep their saved snapshots.`;
}

function defaultId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== "" ? error.message : fallback;
}
