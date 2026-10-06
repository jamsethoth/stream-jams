import { Button, TextInput } from "@mantine/core";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { DisclosureIcon, ModulePageLayout, ModuleControls, ModuleSection, SectionHeading } from "../foundation/ModulePageLayout.js";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
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
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [confirmationError, setConfirmationError] = useState<ActionableManagementError | null>(null);
  const mutationRef = useRef(false);
  const fallbackRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    function correction() { if (window.location.hash === "#browser-sources") { setSourcesExpanded(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#browser-sources button[aria-expanded]")?.focus()); } }
    correction(); window.addEventListener("hashchange", correction); return () => window.removeEventListener("hashchange", correction);
  }, []);

  function clearFeedback() { setNotice(null); setError(null); }
  function reviewConfirmation(next: Confirmation) { if (mutationRef.current) return; clearFeedback(); setConfirmationError(null); setConfirmation(next); }
  function reviewName(next: typeof nameDialog) { if (mutationRef.current) return; clearFeedback(); setNameDialog(next); }

  function showNotice(message: string, tone: ManagementToastNotice["tone"] = "success") {
    setError(null);
    setNotice({ tone, message });
  }

  function showError(cause: unknown, summary: string) {
    setNotice(null);
    setError(actionableError(cause, summary, "Review the saved configuration and local service, then retry the action."));
  }

  async function copy(document: ScreenEffectDocument) {
    if (mutationRef.current) return; mutationRef.current = true;
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
      mutationRef.current = false; setBusy(false);
    }
  }

  async function confirm() {
    if (confirmation === null || mutationRef.current) return;
    mutationRef.current = true;
    setConfirmationError(null);
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
      setConfirmationError(actionableError(mutationError, "The Screen Effect change did not complete.", "Review the saved configuration and local service, then retry the action."));
    } finally {
      mutationRef.current = false; setBusy(false);
    }
  }

  async function saveSetName() {
    if (nameDialog === null || mutationRef.current) return;
    mutationRef.current = true;
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
    finally { mutationRef.current = false; setBusy(false); }
  }

  async function createBrowserSource(source: ScreenEffectBrowserSource) {
    if (mutationRef.current) return; mutationRef.current = true;
    setBusy(true);
    clearFeedback();
    try {
      await api.createBrowserSource(source);
      showNotice(`${source.label} URL was created.`);
      await load();
    } catch (mutationError) {
      showError(mutationError, "The Screen Effects Browser Source URL was not created.");
    } finally {
      mutationRef.current = false; setBusy(false);
    }
  }

  const feedback = <>
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
    {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
  </>;
  const feedbackOwner = nameDialog !== null ? "name" : "page";

  const visibleDocuments = documents.filter((document) => `${document.name} ${document.category ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <>
    <ModulePageLayout className="screen-effects-page"
      feedback={<>{feedbackOwner === "page" ? feedback : null}{loadError === null ? null : <ManagementErrorBanner error={loadError} />}{loading ? <p role="status">Loading Screen Effects…</p> : null}</>}
      controls={<ModuleControls status={moduleEnabled === null ? <p>Module status unavailable</p> : <StatusBadge label={moduleEnabled ? "Module enabled" : "Module disabled"} tone={moduleEnabled ? "positive" : "neutral"} />} description="Coordinate one visual and one optional sound from trusted stream events."><Button ref={fallbackRef} variant="default" disabled={busy || moduleEnabled === null} onClick={() => reviewConfirmation({ kind: "module", enabled: !moduleEnabled })}>{moduleEnabled ? "Disable Screen Effects module" : "Enable Screen Effects module"}</Button></ModuleControls>}
      outputs={<BrowserSourcesPanel id="browser-sources" detailsId="screen-effects-sources-content" expanded={sourcesExpanded} onToggle={() => setSourcesExpanded(value => !value)} readyCount={browserSources.filter(source => source.status === "available").length} needsSetupCount={browserSources.filter(source => source.status !== "available").length} description="Module live and test outputs.">
        <p>Screen Effects uses its own module source or an enabled unified source. Keep Browser Source audio separate from visual surface membership.</p>
        {browserSources.length === 0 ? <p>No Screen Effects Browser Source output is registered.</p> : browserSources.map(source => <BrowserSourceRow key={source.id} label={source.label} ready={source.status === "available"} telemetry={source.status === "available" ? "URL available" : source.status.replace("-", " ")} metadata={<span>Module source · {source.purpose === "live" ? "Live" : "Test"}</span>} url={source.url === null ? <p>Create a URL before adding this output.</p> : <MaskedValue label={`${source.label} Browser Source URL`} value={source.url} />} actions={source.status === "create-required" ? <Button disabled={busy} onClick={() => void createBrowserSource(source)}>Create URL</Button> : <Button color="red" disabled={busy} onClick={() => reviewConfirmation({ kind: "regenerate", source })}>Regenerate URL</Button>} />)}
      </BrowserSourcesPanel>}
    >
    <ModuleSection title="Screen Effect sets" label="Screen Effect sets" actions={<Button disabled={busy} onClick={() => { setSetName(""); reviewName({ kind: "create" }); }}>Create set</Button>}>
      {!loading && documents.length === 0 ? <p>No Screen Effects yet. Create a disabled draft, choose media, then save it.</p> : null}
      <TextInput className="screen-effects-search" label="Search effects" onChange={(event) => setQuery(event.currentTarget.value)} type="search" value={query} />
      <div className="screen-effect-sets">
        {sets.map((set) => <section aria-label={`${set.name} Screen Effect set`} className="screen-effect-set" key={set.id}>
          <SectionHeading level={3} title={<button aria-expanded={expandedSetId === set.id || query.trim() !== ""} aria-controls={`effect-set-${set.id}`} className="screen-effects-disclosure" onClick={() => setExpandedSetId((current) => current === set.id ? null : set.id)} type="button">
              <DisclosureIcon expanded={expandedSetId === set.id || query.trim() !== ""} /><strong>{set.name}</strong> · {set.effectIds.length} {set.effectIds.length === 1 ? "effect" : "effects"}
            </button>} actions={<div className="screen-effects-list__actions">
              <StatusBadge label={set.active ? "Live set" : "Inactive set"} tone={set.active ? "positive" : "neutral"} />
              {!set.active ? <Button variant="default" disabled={busy} onClick={() => reviewConfirmation({ kind: "activate-set", set })} type="button">Activate set</Button> : null}
              <Button variant="default" disabled={busy} onClick={() => { setSetName(set.name); reviewName({ kind: "rename", set }); }} type="button">Rename set</Button>
              <Button variant="default" disabled={busy} onClick={() => { setSetName(`${set.name} copy`); reviewName({ kind: "duplicate", set }); }} type="button">Duplicate set</Button>
              <Button color="red" variant="subtle" disabled={busy || set.active} onClick={() => reviewConfirmation({ kind: "delete-set", set })} type="button">Delete set</Button>
            </div>} />
          {expandedSetId === set.id || query.trim() !== "" ? <div id={`effect-set-${set.id}`}>
            <div className="screen-effects-section-header"><p>{set.active ? "Enabled effects in this set respond to live triggers." : "Inactive set: changes will not affect live triggers until activated."}</p><Button onClick={() => onEdit(generateId("effect"), true, set.id)} type="button">New effect</Button></div>
            <ScreenEffectTree documents={visibleDocuments.filter((document) => set.effectIds.includes(document.id))} onSelect={(effectId, variantId) => onEdit(effectId, false, set.id, variantId)} actions={(document) => <div className="screen-effects-list__actions">
              <Button variant="default" onClick={() => onEdit(document.id, false, set.id)} type="button">Edit</Button>
              <Button variant="default" disabled={busy} onClick={() => reviewConfirmation({ kind: "effect-enable", document })} type="button">{document.enabled ? "Disable" : "Enable"}</Button>
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
    </ModuleSection>
    </ModulePageLayout>

    <ModalSurface labelledBy="screen-effect-set-name" onCancel={() => reviewName(null)} open={nameDialog !== null} pending={busy} restoreFocusFallbackRef={fallbackRef}>
      <form onSubmit={(event) => { event.preventDefault(); void saveSetName(); }}>
        {feedbackOwner === "name" ? feedback : null}
        <ManagementModalTitle>{nameDialog?.kind === "rename" ? "Rename set" : nameDialog?.kind === "duplicate" ? "Duplicate set" : "Create set"}</ManagementModalTitle>
        <TextInput label="Set name" autoFocus maxLength={120} disabled={busy} onChange={(event) => setSetName(event.currentTarget.value)} value={setName} />
        <div className="management-modal__actions"><Button variant="default" disabled={busy} onClick={() => reviewName(null)} type="button">Cancel</Button><Button disabled={busy || setName.trim() === ""} type="submit">Save set</Button></div>
      </form>
    </ModalSurface>
    <DestructiveConfirmationDialog open={confirmation !== null} title={confirmation === null ? "Confirm Screen Effect change" : confirmationTitle(confirmation)} scope={confirmation === null ? "Screen Effects" : confirmationScope(confirmation)} consequences={confirmation === null ? "" : confirmationMessage(confirmation)} recovery={null} actionLabel={confirmation?.kind === "regenerate" ? "Regenerate URL" : "Confirm change"} confirmText={confirmation?.kind === "regenerate" ? "REGENERATE" : undefined} targetId={confirmation === null ? "none" : confirmationTarget(confirmation)} pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef} onCancel={() => reviewConfirmation(null)} onConfirm={confirm} />
  </>;
}

function confirmationScope(value: Exclude<Confirmation, null>): string { return "set" in value ? value.set.name : "document" in value ? value.document.name : value.kind === "regenerate" ? value.source.label : "Screen Effects module"; }
function confirmationTarget(value: Exclude<Confirmation, null>): string { return `${value.kind}:${"set" in value ? value.set.id : "document" in value ? value.document.id : value.kind === "regenerate" ? value.source.id : String(value.enabled)}`; }

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
