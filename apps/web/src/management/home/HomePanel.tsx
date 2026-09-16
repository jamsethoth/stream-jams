import type { ActionableManagementError, HomeSetupSummary } from "@stream-jams/core";
import { useEffect, useState } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import { formatCount } from "../foundation/formatters.js";
import { formatEventLabel } from "../foundation/presentation-labels.js";
import type { ManagementApi } from "../management-api.js";
import "../providers/provider-pages.css";

export interface HomePanelProps {
  readonly managementApi: Pick<ManagementApi, "getHomeSetupSummary">;
}

export function HomePanel({ managementApi }: HomePanelProps) {
  const [summary, setSummary] = useState<HomeSetupSummary | null>(null);
  const [loadError, setLoadError] = useState<ActionableManagementError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .getHomeSetupSummary()
      .then((loaded) => {
        if (!cancelled) {
          setSummary(loaded);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            actionableError(
              error,
              "Unable to load setup readiness",
              "Refresh this page after confirming the local Stream Jams service is running."
            )
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  if (loadError !== null) {
    return <ManagementErrorBanner error={loadError} />;
  }
  if (summary === null) {
    return <p className="provider-page__empty" role="status">Loading setup readiness...</p>;
  }

  const activeSet = summary.activeAlertSet;
  const blockers = activeSet?.validationIssues.filter((issue) => issue.severity === "blocker").length ?? 0;
  const warnings = activeSet?.validationIssues.filter((issue) => issue.severity === "warning").length ?? 0;
  const activeProfiles = activeSet?.targetProfiles.filter((profile) => profile.enabled) ?? [];
  const incompleteReadiness = summary.readiness.filter((item) => item.state !== "complete");
  const completedReadiness = summary.readiness.filter((item) => item.state === "complete");

  return (
    <div className="provider-page home-panel">
      {summary.actionableProblems.length === 0 ? null : (
        <section aria-labelledby="home-problems-title" className="provider-page__section">
          <div className="provider-page__section-heading">
            <div>
              <h2 id="home-problems-title">Needs attention</h2>
              <p>Problems blocking or degrading setup.</p>
            </div>
          </div>
          <div className="provider-page__errors">
            {summary.actionableProblems.map((error, index) => (
              <ManagementErrorBanner error={error} key={error.referenceId ?? `${error.summary}-${index}`} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="setup-readiness-title" className="provider-page__section">
        <div className="provider-page__section-heading">
          <div>
            <h2 id="setup-readiness-title">Setup readiness</h2>
            <p>{incompleteReadiness.length === 0 ? "Setup is complete." : "Complete setup tasks before configuring live alert behavior."}</p>
          </div>
          <StatusBadge
            label={`${summary.readiness.filter((item) => item.state === "complete").length} of ${summary.readiness.length} complete`}
            tone={summary.readiness.every((item) => item.state === "complete") ? "positive" : "info"}
          />
        </div>
        {incompleteReadiness.length === 0 ? null : <div className="provider-page__table-wrap">
          <table className="provider-page__table">
            <thead>
              <tr>
                <th scope="col">Setup item</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {incompleteReadiness.map((item, index) => (
                <tr key={item.id}>
                  <th scope="row">{item.label}</th>
                  <td><StatusBadge label={formatState(item.state)} tone={readinessTone(item.state)} /></td>
                  <td>{index === 0 ? <strong>Next action</strong> : null}<a href={item.actionRoute}>{item.actionLabel}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
        {completedReadiness.length === 0 ? null : (
          <details className="home-panel__completed-setup">
            <summary>Completed setup ({completedReadiness.length})</summary>
            <ul>{completedReadiness.map((item) => <li key={item.id}><span>{item.label}</span><a href={item.actionRoute}>{item.actionLabel}</a></li>)}</ul>
          </details>
        )}
      </section>

      <section aria-labelledby="alert-configuration-title" className="provider-page__section">
        <div className="provider-page__section-heading">
          <div>
            <h2 id="alert-configuration-title">Alert configuration</h2>
            <p>Checks saved content and review state for enabled alerts. Connection and delivery still require the existing Test and output workflows.</p>
          </div>
          <StatusBadge label={configurationLabel(summary.alertConfiguration.state)} tone={configurationTone(summary.alertConfiguration.state)} />
        </div>
        {summary.alertConfiguration.items.length === 0 ? (
          <p className="provider-page__empty">{configurationMessage(summary.alertConfiguration)}</p>
        ) : (
          <ul className="home-panel__configuration-items">
            {summary.alertConfiguration.items.map((item) => (
              <li key={item.alertId}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{formatEventLabel(item.eventType)}</span>
                  <p>{item.message}</p>
                </div>
                <a href={item.actionRoute}>Review alert</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="active-alert-set-title" className="provider-page__section">
        <div className="provider-page__section-heading">
          <div>
            <h2 id="active-alert-set-title">Active alert set</h2>
            <p>Current set used by alert browser-source outputs.</p>
          </div>
          {activeSet === null ? null : <StatusBadge label="Active" tone="positive" />}
        </div>
        {activeSet === null ? (
          <div className="provider-page__empty">
            <p>No active alert set is available.</p>
            <a href="/manage/modules/alerts">Open Alerts</a>
          </div>
        ) : (
          <div className="home-panel__active-set">
            <div>
              <h3>{activeSet.name}</h3>
              <p>{formatCount(activeSet.enabledAlertCount, { one: "enabled alert", other: "enabled alerts" })}</p>
            </div>
            <dl className="provider-page__facts">
              {blockers > 0 ? <div><dt>Blockers</dt><dd>{blockers}</dd></div> : null}
              {warnings > 0 ? <div><dt>Warnings</dt><dd>{formatCount(warnings, { one: "warning", other: "warnings" })}</dd></div> : null}
              <div>
                <dt>Active profiles</dt>
                <dd>{activeProfiles.length === 0 ? "None" : activeProfiles.map((profile) => formatState(profile.id)).join(", ")}</dd>
              </div>
            </dl>
            <a href={`/manage/modules/alerts?set=${encodeURIComponent(activeSet.id)}`}>Review active set</a>
          </div>
        )}
      </section>
    </div>
  );
}

function readinessTone(state: HomeSetupSummary["readiness"][number]["state"]): StatusBadgeTone {
  return state === "complete" ? "positive" : state === "blocked" ? "negative" : "warning";
}

function configurationLabel(state: HomeSetupSummary["alertConfiguration"]["state"]): string {
  if (state === "configured") return "No review flagged";
  if (state === "attention") return "Review needed";
  if (state === "unavailable") return "Unavailable";
  if (state === "no-enabled-alerts") return "No enabled alerts";
  return "No active set";
}

function configurationTone(state: HomeSetupSummary["alertConfiguration"]["state"]): StatusBadgeTone {
  return state === "configured" ? "positive" : state === "attention" || state === "unavailable" ? "warning" : "info";
}

function configurationMessage(configuration: HomeSetupSummary["alertConfiguration"]): string {
  if (configuration.state === "configured") {
    return configuration.enabledAlertCount === 1
      ? "1 enabled default or variation has no saved-configuration review flags."
      : `${configuration.enabledAlertCount} enabled defaults or variations have no saved-configuration review flags.`;
  }
  if (configuration.state === "no-enabled-alerts") return "The active set has no enabled alerts.";
  if (configuration.state === "no-active-set") return "Activate an alert set to review its enabled alert configuration.";
  if (configuration.state === "unavailable") return "Enabled alert configuration could not be checked. Open Alerts and review the active set.";
  return "Open the affected alerts and complete their configuration review.";
}

function formatState(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function actionableError(error: unknown, summary: string, nextStep: string): ActionableManagementError {
  return {
    summary,
    cause: error instanceof Error ? error.message : "The request failed for an unknown reason.",
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: readReferenceId(error),
    correction: null
  };
}

function readReferenceId(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("referenceId" in error)) {
    return null;
  }
  return typeof error.referenceId === "string" && error.referenceId.length > 0 ? error.referenceId : null;
}
