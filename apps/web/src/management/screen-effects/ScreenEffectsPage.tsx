import { actionableError } from "../foundation/actionable-error.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import type { ActionableManagementError } from "@stream-jams/core";
import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import {
  duplicateScreenEffect,
  type ScreenEffectSet,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { useCallback, useEffect, useState } from "react";
import { ActionMenu } from "../foundation/ActionMenu.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { MaskedValue } from "../foundation/MaskedValue.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import type {
  ScreenEffectBrowserSource,
  ScreenEffectsApi
} from "./screen-effects-api.js";
import "./screen-effects.css";
import { ScreenEffectTree } from "./ScreenEffectTree.js";

export interface ScreenEffectsPageProps {
  readonly api: ScreenEffectsApi;
  readonly onEdit: (effectId: string, create: boolean, setId?: string, variantId?: string) => void;
  readonly initialSetId?: string | undefined;
  readonly generateId?: (prefix: string) => string;
}

type Confirmation =
  | { readonly kind: "activate-set"; readonly set: ScreenEffectSet }
  | { readonly kind: "delete-set"; readonly set: ScreenEffectSet }
  | { readonly kind: "effect-enable"; readonly document: ScreenEffectDocument }
  | { readonly kind: "delete"; readonly document: ScreenEffectDocument }
  | { readonly kind: "module"; readonly enabled: boolean }
  | { readonly kind: "regenerate"; readonly source: ScreenEffectBrowserSource }
  | null;

export function ScreenEffectsPage({ api, onEdit, initialSetId, generateId = defaultId }: ScreenEffectsPageProps) {
  const [sets, setSets] = useState<readonly ScreenEffectSet[]>([]);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(initialSetId ?? null);
  const [nameDialog, setNameDialog] = useState<{ kind: "create" | "rename" | "duplicate"; set?: ScreenEffectSet } | null>(null);
  const [setName, setSetName] = useState("");
  const [documents, setDocuments] = useState<readonly ScreenEffectDocument[]>([]);
  const [browserSources, setBrowserSources] = useState<readonly ScreenEffectBrowserSource[]>([]);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ActionableManagementError | null>(null);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedDocuments, loadedSources, loadedModuleEnabled, loadedSets] = await Promise.all([
        api.list(),
        api.listBrowserSources(),
        api.getModuleEnabled(),
        api.listSets()
      ]);
      setDocuments(loadedDocuments);
      setBrowserSources(loadedSources);
      setModuleEnabled(loadedModuleEnabled);
      setSets(loadedSets);
      setExpandedSetId((current) => loadedSets.some((set) => set.id === current) ? current : loadedSets.find((set) => set.active)?.id ?? null);
      setLoadError(null);
    } catch (loadError) {
      setLoadError(actionableError(loadError, "Screen Effects could not be loaded.", "Retry by reopening Screen Effects. The last loaded inventory is retained."));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  function clearFeedback() { setNotice(null); setError(null); }
  function reviewConfirmation(next: Confirmation) { clearFeedback(); setConfirmation(next); }
  function reviewName(next: typeof nameDialog) { clearFeedback(); setNameDialog(next); }

  function showNotice(message: string, tone: ManagementToastNotice["tone"] = "success") {
    setError(null);
    setNotice({ tone, message });
  }

  function showError(cause: unknown, summary: string) {
    setNotice(null);
    setError(actionableError(cause, summary, "Review the saved configuration and local service, then retry the action."));
  }

  async function copy(document: ScreenEffectDocument) {
    setBusy(true);
    clearFeedback();
    try {
      const copy = duplicateScreenEffect(document, {
        id: generateId("effect"),
        name: `${document.name} copy`,
        variantIds: document.variants.map(() => generateId("variant")),
        bindingIds: document.bindings.map(() => generateId("binding"))
      });
      await api.create(copy, sets.find((set) => set.effectIds.includes(document.id))?.id);
      showNotice(`${copy.name} was created disabled.`);
      await load();
    } catch (copyError) {
      showError(copyError, "The Screen Effect could not be copied.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (confirmation === null) return;
    setBusy(true);
    clearFeedback();
    try {
      if (confirmation.kind === "activate-set") {
        await api.activateSet(confirmation.set.id);
        showNotice(`${confirmation.set.name} is now the live Screen Effect set.`);
      } else if (confirmation.kind === "delete-set") {
        await api.removeSet(confirmation.set.id);
        showNotice(`${confirmation.set.name} was deleted.`);
      } else if (confirmation.kind === "module") {
        await api.setModuleEnabled(confirmation.enabled);
        showNotice(`Screen Effects module is now ${confirmation.enabled ? "enabled" : "disabled"}.`);
      } else if (confirmation.kind === "regenerate") {
        await api.regenerateBrowserSource(confirmation.source);
        showNotice(`${confirmation.source.label} URL was regenerated. Update every browser source that used the old URL.`, "warning");
        setRegenerateConfirmation("");
      } else if (confirmation.kind === "delete") {
        await api.remove(confirmation.document.id);
        showNotice(`${confirmation.document.name} was deleted.`);
      } else {
        await api.update(
          confirmation.document.id,
          { ...confirmation.document, enabled: !confirmation.document.enabled },
          true
        );
        showNotice(`${confirmation.document.name} is now ${confirmation.document.enabled ? "disabled" : "enabled"}.`);
      }
      setConfirmation(null);
      await load();
    } catch (mutationError) {
      showError(mutationError, "The Screen Effect change did not complete.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSetName() {
    if (nameDialog === null) return;
    setBusy(true);
    clearFeedback();
    try {
      const saved = nameDialog.kind === "rename" && nameDialog.set !== undefined
        ? await api.renameSet(nameDialog.set.id, setName)
        : await api.createSet({ id: generateId("effect-set"), name: setName }, nameDialog.kind === "duplicate" ? nameDialog.set?.id : undefined);
      setExpandedSetId(saved.id);
      setNameDialog(null);
      await load();
      showNotice(`${saved.name} was saved${saved.active ? "." : " as an inactive set."}`);
    } catch (error) { showError(error, "Screen Effect set could not be saved."); }
    finally { setBusy(false); }
  }

  async function createBrowserSource(source: ScreenEffectBrowserSource) {
    setBusy(true);
    clearFeedback();
    try {
      await api.createBrowserSource(source);
      showNotice(`${source.label} URL was created.`);
      await load();
    } catch (mutationError) {
      showError(mutationError, "The Screen Effects Browser Source URL was not created.");
    } finally {
      setBusy(false);
    }
  }

  const feedback = <>
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
    {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
  </>;
  const feedbackOwner = nameDialog !== null ? "name" : confirmation !== null ? "confirmation" : "page";

  const visibleDocuments = documents.filter((document) => `${document.name} ${document.category ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <div className="screen-effects-page">
    <BrowserSourcesPanel detailsId="screen-effects-sources-content" expanded={sourcesExpanded} onToggle={() => setSourcesExpanded(value => !value)} readyCount={browserSources.filter(source => source.status === "available").length} needsSetupCount={browserSources.filter(source => source.status !== "available").length}>
      <p>Screen Effects uses its own module source or an enabled unified source. Keep Browser Source audio separate from visual surface membership.</p>
      {browserSources.length === 0 ? <p>No Screen Effects Browser Source output is registered.</p> : <ul>{browserSources.map((source) => <li key={source.id}><div><strong>{source.label}</strong><span>{source.status === "available" ? "URL available" : source.status.replace("-", " ")}</span></div>{source.url === null ? null : <MaskedValue label={`${source.label} Browser Source URL`} value={source.url} />}<div className="screen-effects-list__actions">{source.status === "create-required" ? <button className="button button--primary" disabled={busy} onClick={() => void createBrowserSource(source)} type="button">Create URL</button> : <button className="button button--danger" disabled={busy} onClick={() => { setRegenerateConfirmation(""); reviewConfirmation({ kind: "regenerate", source }); }} type="button">Regenerate URL</button>}</div></li>)}</ul>}
    </BrowserSourcesPanel>

    <section aria-labelledby="screen-effects-inventory-title" className="management-card screen-effects-inventory">
      <header className="screen-effects-section-header">
        <div><h2 id="screen-effects-inventory-title">Screen Effects</h2><p>Coordinate one visual and one optional sound from trusted stream events.</p>{moduleEnabled === null ? null : <StatusBadge label={moduleEnabled ? "Module enabled" : "Module disabled"} tone={moduleEnabled ? "positive" : "neutral"} />}</div>
        <div className="screen-effects-list__actions"><button className="button button--secondary" disabled={busy || moduleEnabled === null} onClick={() => reviewConfirmation({ kind: "module", enabled: !moduleEnabled })} type="button">{moduleEnabled ? "Disable Screen Effects module" : "Enable Screen Effects module"}</button><button className="button button--primary" onClick={() => { setSetName(""); reviewName({ kind: "create" }); }} type="button">Create set</button></div>
      </header>
      {feedbackOwner === "page" ? feedback : null}
      {loadError === null ? null : <ManagementErrorBanner error={loadError} />}
      {loading ? <p role="status">Loading Screen Effects…</p> : null}
      {!loading && documents.length === 0 ? <p>No Screen Effects yet. Create a disabled draft, choose media, then save it.</p> : null}
      <label className="screen-effects-search">Search effects<input onChange={(event) => setQuery(event.currentTarget.value)} type="search" value={query} /></label>
      <div className="screen-effect-sets">
        {sets.map((set) => <section aria-label={`${set.name} Screen Effect set`} className="screen-effect-set" key={set.id}>
          <header className="screen-effects-section-header">
            <button aria-expanded={expandedSetId === set.id || query.trim() !== ""} aria-controls={`effect-set-${set.id}`} className="screen-effects-disclosure" onClick={() => setExpandedSetId((current) => current === set.id ? null : set.id)} type="button">
              <strong>{set.name}</strong> · {set.effectIds.length} {set.effectIds.length === 1 ? "effect" : "effects"}
            </button>
            <div className="screen-effects-list__actions">
              <StatusBadge label={set.active ? "Live set" : "Inactive set"} tone={set.active ? "positive" : "neutral"} />
              {!set.active ? <button className="button button--secondary" disabled={busy} onClick={() => reviewConfirmation({ kind: "activate-set", set })} type="button">Activate set</button> : null}
              <button className="button button--secondary" disabled={busy} onClick={() => { setSetName(set.name); reviewName({ kind: "rename", set }); }} type="button">Rename set</button>
              <button className="button button--secondary" disabled={busy} onClick={() => { setSetName(`${set.name} copy`); reviewName({ kind: "duplicate", set }); }} type="button">Duplicate set</button>
              <button className="button button--danger-quiet" disabled={busy || set.active} onClick={() => reviewConfirmation({ kind: "delete-set", set })} type="button">Delete set</button>
            </div>
          </header>
          {expandedSetId === set.id || query.trim() !== "" ? <div id={`effect-set-${set.id}`}>
            <div className="screen-effects-section-header"><p>{set.active ? "Enabled effects in this set respond to live triggers." : "Inactive set: changes will not affect live triggers until activated."}</p><button className="button button--primary" onClick={() => onEdit(generateId("effect"), true, set.id)} type="button">New effect</button></div>
            <ScreenEffectTree documents={visibleDocuments.filter((document) => set.effectIds.includes(document.id))} onSelect={(effectId, variantId) => onEdit(effectId, false, set.id, variantId)} actions={(document) => <div className="screen-effects-list__actions">
              <button className="button button--secondary" onClick={() => onEdit(document.id, false, set.id)} type="button">Edit</button>
              <button className="button button--secondary" disabled={busy} onClick={() => reviewConfirmation({ kind: "effect-enable", document })} type="button">{document.enabled ? "Disable" : "Enable"}</button>
              <ActionMenu
                items={[
                  { accessibleLabel: `Copy ${document.name}`, disabled: busy, label: "Copy", onSelect: () => void copy(document) },
                  { accessibleLabel: `Delete ${document.name}`, disabled: busy, label: "Delete", onSelect: () => reviewConfirmation({ kind: "delete", document }), tone: "danger" }
                ]}
                label={`More actions for ${document.name}`}
              />
              <a href="/manage/event-sources">Review trigger setup</a>
            </div>} />
            {set.effectIds.length === 0 ? <p>No effects in this set. Create a disabled draft to get started.</p> : null}
          </div> : null}
        </section>)}
      </div>
      {!loading && documents.length > 0 && visibleDocuments.length === 0 ? <p role="status">No effects match your search.</p> : null}
    </section>

    <ModalSurface labelledBy="screen-effect-set-name" onCancel={() => reviewName(null)} open={nameDialog !== null}>
      <form onSubmit={(event) => { event.preventDefault(); void saveSetName(); }}>
        {feedbackOwner === "name" ? feedback : null}
        <ManagementModalTitle>{nameDialog?.kind === "rename" ? "Rename set" : nameDialog?.kind === "duplicate" ? "Duplicate set" : "Create set"}</ManagementModalTitle>
        <label>Set name<input autoFocus maxLength={120} onChange={(event) => setSetName(event.currentTarget.value)} value={setName} /></label>
        <div className="management-modal__actions"><button className="button button--secondary" onClick={() => reviewName(null)} type="button">Cancel</button><button className="button button--primary" disabled={busy || setName.trim() === ""} type="submit">Save set</button></div>
      </form>
    </ModalSurface>
    <ModalSurface labelledBy="screen-effect-confirm-title" onCancel={() => reviewConfirmation(null)} open={confirmation !== null}>
      {confirmation === null ? null : <div>
        {feedbackOwner === "confirmation" ? feedback : null}
        <ManagementModalTitle>{confirmationTitle(confirmation)}</ManagementModalTitle>
        <p>{confirmationMessage(confirmation)}</p>
        {confirmation.kind === "regenerate" ? <label><span>Type REGENERATE to continue</span><input autoComplete="off" onChange={(event) => setRegenerateConfirmation(event.currentTarget.value)} value={regenerateConfirmation} /></label> : null}
        <div className="management-modal__actions"><button className="button button--secondary" onClick={() => { reviewConfirmation(null); setRegenerateConfirmation(""); }} type="button">Cancel</button><button className={confirmation.kind === "delete" || confirmation.kind === "regenerate" ? "button button--danger" : "button button--primary"} disabled={busy || (confirmation.kind === "regenerate" && regenerateConfirmation !== "REGENERATE")} onClick={() => void confirm()} type="button">{confirmation.kind === "regenerate" ? "Regenerate URL" : "Confirm change"}</button></div>
      </div>}
    </ModalSurface>
  </div>;
}

function confirmationTitle(confirmation: Exclude<Confirmation, null>): string {
  if (confirmation.kind === "activate-set") return `Activate ${confirmation.set.name}?`;
  if (confirmation.kind === "delete-set") return `Delete ${confirmation.set.name}?`;
  if (confirmation.kind === "delete") return "Delete Screen Effect?";
  if (confirmation.kind === "regenerate") return `Regenerate ${confirmation.source.label} URL?`;
  if (confirmation.kind === "module") return `${confirmation.enabled ? "Enable" : "Disable"} Screen Effects module?`;
  return `${confirmation.document.enabled ? "Disable" : "Enable"} Screen Effect?`;
}

function confirmationMessage(confirmation: Exclude<Confirmation, null>): string {
  if (confirmation.kind === "activate-set") return `Only enabled effects in ${confirmation.set.name} will respond to new live triggers. Already queued effects keep their saved snapshots.`;
  if (confirmation.kind === "delete-set") return `Delete ${confirmation.set.name} and all its effects, variants and triggers?`;
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
