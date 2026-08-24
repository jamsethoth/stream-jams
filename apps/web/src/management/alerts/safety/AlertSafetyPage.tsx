import type { ActionableManagementError } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../../foundation/ManagementToast.js";
import type {
  ManagementApi,
  ModerationActionView,
  ModerationPreviewResultView,
  ModerationSettingsView,
  ModerationTargetSettingsView
} from "../../management-api.js";
import { useDirtyNavigationSource, type DirtyNavigationSaveResult } from "../../navigation/dirty-navigation.js";
import "./alert-safety-page.css";

type AlertSafetyApi = Pick<ManagementApi, "getModerationSettings" | "updateModerationSettings" | "previewModeration">;
type TargetKey = keyof ModerationSettingsView;

interface TargetDraft {
  readonly maxLength: string;
  readonly blockedTerms: string;
  readonly stripUrls: boolean;
}

interface PolicyDraft {
  readonly renderedText: TargetDraft;
  readonly ttsText: TargetDraft;
}

type FieldErrors = Partial<Record<`${TargetKey}.maxLength`, string>>;

export interface AlertSafetyPageProps {
  readonly managementApi: AlertSafetyApi;
}

const defaultExample = "Visit https://example.com for a spoiler before the alert becomes too long.";

export function AlertSafetyPage({ managementApi }: AlertSafetyPageProps) {
  const [saved, setSaved] = useState<ModerationSettingsView | null>(null);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [example, setExample] = useState(defaultExample);
  const [previews, setPreviews] = useState<readonly [ModerationPreviewResultView, ModerationPreviewResultView] | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [initialLoadError, setInitialLoadError] = useState<ActionableManagementError | null>(null);
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const previewGeneration = useRef(0);

  const invalidatePreview = useCallback(() => {
    previewGeneration.current += 1;
    setPreviews(null);
    return previewGeneration.current;
  }, []);

  const load = useCallback(async () => {
    invalidatePreview();
    setLoading(true);
    setInitialLoadError(null);
    try {
      const settings = await managementApi.getModerationSettings();
      setSaved(settings);
      setDraft(toDraft(settings));
    } catch (cause) {
      setInitialLoadError(actionable(
        "Alert safety settings could not be loaded",
        cause,
        "Retry loading safety settings. If the problem continues, open Diagnostics."
      ));
    } finally {
      setLoading(false);
    }
  }, [invalidatePreview, managementApi]);

  useEffect(() => { void load(); }, [load]);

  const candidate = useMemo(() => draft === null ? null : toCandidate(draft), [draft]);
  const dirty = saved !== null && candidate !== null && !samePolicy(saved, candidate);

  const save = useCallback(async (): Promise<DirtyNavigationSaveResult> => {
    if (draft === null) return false;
    invalidatePreview();
    const validation = validateDraft(draft);
    setErrors(validation.errors);
    if (validation.settings === null) {
      return { saved: false, error: formatValidationFailure(validation.errors) };
    }

    setBusy("save");
    setActionError(null);
    setNotice(null);
    try {
      const next = await managementApi.updateModerationSettings(validation.settings);
      setSaved(next);
      setDraft(toDraft(next));
      setNotice({ tone: "success", message: "Safety settings saved.", detail: "New alerts and previews now use this policy." });
      return true;
    } catch (cause) {
      const error = actionable(
        "Safety settings were not saved",
        cause,
        "Try saving again. If the problem continues, open Diagnostics."
      );
      setActionError(error);
      return { saved: false, error: formatSaveFailure(error) };
    } finally {
      setBusy(null);
    }
  }, [draft, invalidatePreview, managementApi]);

  const revert = useCallback(() => {
    if (saved === null) return;
    setDraft(toDraft(saved));
    setErrors({});
    invalidatePreview();
    setActionError(null);
    setNotice(null);
  }, [invalidatePreview, saved]);

  useDirtyNavigationSource({
    id: "alert-safety",
    dirty,
    summary: "Alert safety settings have unsaved changes.",
    save,
    discard: revert
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save();
  }

  async function preview() {
    if (draft === null) return;
    const requestGeneration = invalidatePreview();
    const validation = validateDraft(draft);
    setErrors(validation.errors);
    if (validation.settings === null) return;

    setBusy("preview");
    setActionError(null);
    setNotice(null);
    try {
      const results = await Promise.all([
        managementApi.previewModeration({ target: "rendered", text: example, settings: validation.settings.renderedText }),
        managementApi.previewModeration({ target: "tts", text: example, settings: validation.settings.ttsText })
      ]);
      if (previewGeneration.current === requestGeneration) setPreviews(results);
    } catch (cause) {
      if (previewGeneration.current === requestGeneration) {
        setPreviews(null);
        setActionError(actionable(
          "The moderation example could not be previewed",
          cause,
          "Review the candidate settings and try the preview again."
        ));
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="management-empty" role="status">Loading alert safety settings...</p>;
  if (initialLoadError !== null || draft === null) {
    return (
      <section aria-label="Alert safety" className="alert-safety-page">
        {initialLoadError === null ? null : <ManagementErrorBanner error={initialLoadError} />}
        <button className="button button--secondary" onClick={() => void load()} type="button">Retry loading safety settings</button>
      </section>
    );
  }

  return (
    <section aria-label="Alert safety" className="alert-safety-page">
      {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      <section aria-labelledby="impact-heading" className="alert-safety-page__section">
        <h3 id="impact-heading">Shared alert policy</h3>
        <p>Saved changes apply immediately to local Preview, Send test, live rendered alerts, browser speech, and provider TTS.</p>
        <p>Provider connection, voice, rate, volume, and provider registration safety remain on <a href="/manage/tts-providers">Review TTS provider settings</a>.</p>
      </section>

      <form className="alert-safety-page__form" noValidate onSubmit={(event) => void submit(event)}>
        <TargetFieldset
          disabled={busy === "save"}
          draft={draft.renderedText}
          error={errors["renderedText.maxLength"]}
          label="Rendered text"
          onChange={(next) => {
            invalidatePreview();
            setDraft({ ...draft, renderedText: next });
          }}
          target="renderedText"
        />
        <TargetFieldset
          disabled={busy === "save"}
          draft={draft.ttsText}
          error={errors["ttsText.maxLength"]}
          label="TTS text"
          onChange={(next) => {
            invalidatePreview();
            setDraft({ ...draft, ttsText: next });
          }}
          target="ttsText"
        />
        <div className="alert-safety-page__actions">
          <button disabled={busy !== null || !dirty} type="submit">{busy === "save" ? "Saving..." : "Save safety settings"}</button>
          <button className="button button--secondary" disabled={busy !== null || !dirty} onClick={revert} type="button">Revert changes</button>
        </div>
      </form>

      <section aria-labelledby="example-heading" className="alert-safety-page__section alert-safety-page__example">
        <div className="alert-safety-page__section-heading">
          <div><h3 id="example-heading">Try an example</h3><p>This sample is kept only for this browser session and is never saved with the policy.</p></div>
          <button disabled={busy !== null} onClick={() => void preview()} type="button">{busy === "preview" ? "Previewing..." : "Preview example"}</button>
        </div>
        <label><span>Moderation example</span><textarea onChange={(event) => {
          invalidatePreview();
          setExample(event.currentTarget.value);
        }} rows={4} value={example} /></label>
        {previews === null ? null : (
          <div className="alert-safety-page__previews">
            <PreviewResult label="Rendered text" result={previews[0]} />
            <PreviewResult label="TTS text" result={previews[1]} />
          </div>
        )}
      </section>
    </section>
  );
}

function TargetFieldset({ disabled, draft, error, label, onChange, target }: {
  readonly disabled: boolean;
  readonly draft: TargetDraft;
  readonly error: string | undefined;
  readonly label: string;
  readonly onChange: (next: TargetDraft) => void;
  readonly target: TargetKey;
}) {
  const errorId = `${target}-max-length-error`;
  return (
    <fieldset className="alert-safety-page__fieldset" disabled={disabled}>
      <legend>{label}</legend>
      <p>Sanitize this output independently before it reaches an alert surface.</p>
      <label>
        <span>{label} maximum length</span>
        <input
          aria-describedby={error === undefined ? undefined : errorId}
          aria-invalid={error === undefined ? undefined : true}
          max={10_000}
          min={1}
          onChange={(event) => onChange({ ...draft, maxLength: event.currentTarget.value })}
          step={1}
          type="number"
          value={draft.maxLength}
        />
      </label>
      {error === undefined ? null : <p className="alert-safety-page__field-error" id={errorId}>{error}</p>}
      <label>
        <span>{label} blocked terms</span>
        <textarea
          onChange={(event) => onChange({ ...draft, blockedTerms: event.currentTarget.value })}
          placeholder="One term per line"
          rows={6}
          value={draft.blockedTerms}
        />
      </label>
      <label className="alert-safety-page__checkbox">
        <input checked={draft.stripUrls} onChange={(event) => onChange({ ...draft, stripUrls: event.currentTarget.checked })} type="checkbox" />
        {label} strip web links
      </label>
    </fieldset>
  );
}

function PreviewResult({ label, result }: { readonly label: string; readonly result: ModerationPreviewResultView }) {
  return (
    <section aria-label={`${label} preview`} className="alert-safety-page__preview">
      <h4>{label}</h4>
      <dl>
        <div><dt>Normalized blocked terms</dt><dd>{result.settings.blockedTerms.join(", ") || "None"}</dd></div>
        <div><dt>Sanitized output</dt><dd className="alert-safety-page__output">{result.text === "" ? "Empty output" : result.text}</dd></div>
      </dl>
      <ul aria-label={`${label} moderation actions`}>
        {result.actions.length === 0 ? <li>No moderation actions</li> : result.actions.map((action, index) => <li key={`${action.type}-${index}`}>{formatAction(action)}</li>)}
      </ul>
    </section>
  );
}

function formatAction(action: ModerationActionView): string {
  switch (action.type) {
    case "url-stripped": return `Web links stripped: ${action.count}`;
    case "blocked-term-replaced": return `Blocked terms replaced: ${action.count}`;
    case "max-length-truncated": return `Truncated to ${action.maxLength} characters`;
  }
}

function toDraft(settings: ModerationSettingsView): PolicyDraft {
  return {
    renderedText: targetToDraft(settings.renderedText),
    ttsText: targetToDraft(settings.ttsText)
  };
}

function targetToDraft(settings: ModerationTargetSettingsView): TargetDraft {
  return {
    maxLength: String(settings.maxLength),
    blockedTerms: settings.blockedTerms.join("\n"),
    stripUrls: settings.stripUrls
  };
}

function toCandidate(draft: PolicyDraft): ModerationSettingsView {
  return {
    renderedText: draftTargetToCandidate(draft.renderedText),
    ttsText: draftTargetToCandidate(draft.ttsText)
  };
}

function draftTargetToCandidate(draft: TargetDraft): ModerationTargetSettingsView {
  return {
    maxLength: Number(draft.maxLength),
    blockedTerms: draft.blockedTerms.split(/\r?\n/u).map((term) => term.trim()).filter((term) => term.length > 0),
    stripUrls: draft.stripUrls
  };
}

function validateDraft(draft: PolicyDraft): { readonly settings: ModerationSettingsView | null; readonly errors: FieldErrors } {
  const settings = toCandidate(draft);
  const errors: FieldErrors = {};
  if (!validMaxLength(settings.renderedText.maxLength)) errors["renderedText.maxLength"] = "Enter a whole number from 1 to 10000.";
  if (!validMaxLength(settings.ttsText.maxLength)) errors["ttsText.maxLength"] = "Enter a whole number from 1 to 10000.";
  return { settings: Object.keys(errors).length === 0 ? settings : null, errors };
}

function validMaxLength(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10_000;
}

function formatValidationFailure(errors: FieldErrors): string {
  const details = [
    errors["renderedText.maxLength"] === undefined ? null : `Rendered text maximum length: ${errors["renderedText.maxLength"]}`,
    errors["ttsText.maxLength"] === undefined ? null : `TTS text maximum length: ${errors["ttsText.maxLength"]}`
  ].filter((detail): detail is string => detail !== null);
  return `Safety settings were not saved. ${details.join(" ")} Correct the values or cancel to continue editing.`;
}

function formatSaveFailure(error: ActionableManagementError): string {
  const reference = error.referenceId === null ? "" : ` Reference ID: ${error.referenceId}.`;
  return `${error.summary}. ${error.nextStep}${reference}`;
}

function samePolicy(left: ModerationSettingsView, right: ModerationSettingsView): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function actionable(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  const referenceId = readReferenceId(cause);
  return {
    summary,
    cause: cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "The operation did not complete.",
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId,
    correction: referenceId === null ? null : { label: "Open Diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}` }
  };
}

function readReferenceId(cause: unknown): string | null {
  if (typeof cause === "object" && cause !== null && "referenceId" in cause && typeof cause.referenceId === "string") return cause.referenceId;
  if (!(cause instanceof Error)) return null;
  return /\b(?:ref|err)[_-][A-Za-z0-9_-]+\b/u.exec(cause.message)?.[0] ?? null;
}
