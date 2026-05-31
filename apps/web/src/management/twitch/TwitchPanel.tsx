import { useEffect, useState } from "react";
import type { ManagementApi, TwitchConnectionStatusView, TwitchEventSubStatusView } from "../management-api.js";

export interface TwitchPanelProps {
  readonly managementApi: Pick<
    ManagementApi,
    "getTwitchStatus" | "getTwitchEventSubStatus" | "startTwitchAuth" | "refreshTwitchAuth" | "disconnectTwitch"
  >;
}

export function TwitchPanel({ managementApi }: TwitchPanelProps) {
  const [status, setStatus] = useState<TwitchConnectionStatusView | null>(null);
  const [eventSubStatus, setEventSubStatus] = useState<TwitchEventSubStatusView | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .getTwitchStatus()
      .then(async (loadedStatus) => ({
        connection: loadedStatus,
        eventSub: await managementApi.getTwitchEventSubStatus()
      }))
      .then((loadedStatus) => {
        if (!cancelled) {
          setStatus(loadedStatus.connection);
          setEventSubStatus(loadedStatus.eventSub);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load Twitch status."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function startConnection() {
    try {
      const result = await managementApi.startTwitchAuth({
        redirectUri: window.location.origin + "/twitch/auth/callback"
      });
      setAuthorizationUrl(result.authorizationUrl);
      setDiagnostic("Twitch authorization ready.");
    } catch (error) {
      setAuthorizationUrl(null);
      setDiagnostic(readErrorMessage(error, "Unable to start Twitch authorization."));
    }
  }

  async function refreshConnection() {
    try {
      setStatus(await managementApi.refreshTwitchAuth());
      setEventSubStatus(await managementApi.getTwitchEventSubStatus());
      setDiagnostic("Twitch connection refreshed.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to refresh Twitch connection."));
    }
  }

  async function disconnect() {
    try {
      setStatus(await managementApi.disconnectTwitch());
      setEventSubStatus(await managementApi.getTwitchEventSubStatus());
      setAuthorizationUrl(null);
      setDiagnostic("Twitch disconnected.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to disconnect Twitch."));
    }
  }

  return (
    <section className="management-panel" aria-labelledby="twitch-title">
      <div className="management-panel__header">
        <div>
          <h2 id="twitch-title">Twitch</h2>
          <p>{status === null ? "Loading connection" : status.connected ? status.account.displayName : "Disconnected"}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {eventSubStatus !== null ? (
        <p className="management-diagnostic">EventSub {eventSubStatus.state}</p>
      ) : null}
      {status === null ? <p className="management-empty">Loading Twitch connection...</p> : null}
      {status !== null && !status.connected ? (
        <section className="management-subsection" aria-labelledby="twitch-disconnected-title">
          <h3 id="twitch-disconnected-title">Twitch disconnected</h3>
          <div className="management-actions">
            <button onClick={startConnection} type="button">
              Connect Twitch
            </button>
          </div>
          {authorizationUrl === null ? null : (
            <p className="management-diagnostic">
              <a href={authorizationUrl} rel="noreferrer" target="_blank">
                Open Twitch authorization
              </a>
            </p>
          )}
        </section>
      ) : null}
      {status !== null && status.connected ? (
        <section className="management-subsection" aria-labelledby="twitch-connected-title">
          <h3 id="twitch-connected-title">{status.account.displayName}</h3>
          <p>{status.account.login}</p>
          <ul className="management-list">
            {status.account.scopes.map((scope) => (
              <li key={scope}>
                <span>{scope}</span>
              </li>
            ))}
          </ul>
          <div className="management-actions">
            <button onClick={refreshConnection} type="button">
              Refresh Twitch
            </button>
            <button onClick={disconnect} type="button">
              Disconnect Twitch
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
