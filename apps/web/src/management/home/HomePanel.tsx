import type { ActionableManagementError, HomeSetupSummary } from "@stream-jams/core";
import { useEffect, useState } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
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

  return (
    <div className="provider-page home-panel">
      <section aria-labelledby="setup-readiness-title" className="provider-page__section">
        <div className="provider-page__section-heading">
          <div>
            <h2 id="setup-readiness-title">Setup readiness</h2>
            <p>Complete setup tasks before configuring live alert behavior.</p>
          </div>
          <StatusBadge
            label={`${summary.readiness.filter((item) => item.state === "complete").length} of ${summary.readiness.length} complete`}
            tone={summary.readiness.every((item) => item.state === "complete") ? "positive" : "info"}
          />
        </div>
        <div className="provider-page__table-wrap">
          <table className="provider-page__table">
            <thead>
              <tr>
                <th scope="col">Setup item</th>
                <th scope="col">Status</th>
                <th scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {summary.readiness.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.label}</th>
                  <td><StatusBadge label={formatState(item.state)} tone={readinessTone(item.state)} /></td>
                  <td><a href={item.actionRoute}>{item.actionLabel}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <p>{activeSet.enabledAlertCount} enabled alerts</p>
            </div>
            <dl className="provider-page__facts">
              <div><dt>Blockers</dt><dd>{blockers}</dd></div>
              <div><dt>Warnings</dt><dd>{warnings === 1 ? "1 warning" : `${warnings} warnings`}</dd></div>
              <div>
                <dt>Active profiles</dt>
                <dd>{activeProfiles.length === 0 ? "None" : activeProfiles.map((profile) => formatState(profile.id)).join(", ")}</dd>
              </div>
            </dl>
            <a href={`/manage/modules/alerts?set=${encodeURIComponent(activeSet.id)}`}>Review active set</a>
          </div>
        )}
      </section>

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
    </div>
  );
}

function readinessTone(state: HomeSetupSummary["readiness"][number]["state"]): StatusBadgeTone {
  return state === "complete" ? "positive" : state === "blocked" ? "negative" : "warning";
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
