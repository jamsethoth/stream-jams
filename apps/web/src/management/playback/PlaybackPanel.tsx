import { useEffect, useState } from "react";
import type { ManagementApi, PlaybackView } from "../management-api.js";

export interface PlaybackPanelProps {
  readonly managementApi: Pick<
    ManagementApi,
    | "getPlayback"
    | "pausePlayback"
    | "resumePlayback"
    | "skipPlayback"
    | "replayRecent"
    | "mutePlayback"
    | "unmutePlayback"
    | "setDoNotDisturb"
  >;
}

export function PlaybackPanel({ managementApi }: PlaybackPanelProps) {
  const [playback, setPlayback] = useState<PlaybackView | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .getPlayback()
      .then((loadedPlayback) => {
        if (!cancelled) {
          setPlayback(loadedPlayback);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load playback."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function runControl(action: () => Promise<PlaybackView>, message: string) {
    try {
      const updatedPlayback = await action();
      setPlayback(updatedPlayback);
      setDiagnostic(message);
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to update playback."));
    }
  }

  const recentItemId = playback?.recent[0]?.id;

  return (
    <section className="management-panel" aria-labelledby="playback-title">
      <div className="management-panel__header">
        <div>
          <h2 id="playback-title">Playback</h2>
          <p>{playback === null ? "Loading queue" : `${playback.queuedCount} queued`}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {playback === null ? <p className="management-empty">Loading playback...</p> : null}
      {playback !== null ? (
        <>
          <div className="management-playback-status">
            <span>{playback.current === null ? "Nothing playing" : playback.current.label}</span>
            <strong>{playback.paused ? "Paused" : "Active"}</strong>
            <strong>{playback.muted ? "Muted" : "Audible"}</strong>
          </div>
          <div className="management-actions">
            <button onClick={() => runControl(() => managementApi.pausePlayback(), "Playback paused.")} type="button">
              Pause
            </button>
            <button onClick={() => runControl(() => managementApi.resumePlayback(), "Playback resumed.")} type="button">
              Resume
            </button>
            <button onClick={() => runControl(() => managementApi.skipPlayback(), "Playback skipped.")} type="button">
              Skip
            </button>
            <button
              disabled={recentItemId === undefined}
              onClick={() =>
                recentItemId === undefined
                  ? undefined
                  : runControl(() => managementApi.replayRecent(recentItemId), "Recent playback replayed.")
              }
              type="button"
            >
              Replay recent
            </button>
            <button onClick={() => runControl(() => managementApi.mutePlayback(), "Playback muted.")} type="button">
              Mute
            </button>
            <button onClick={() => runControl(() => managementApi.unmutePlayback(), "Playback unmuted.")} type="button">
              Unmute
            </button>
            <label className="management-toggle">
              <input
                checked={playback.doNotDisturb}
                onChange={(event) =>
                  runControl(() => managementApi.setDoNotDisturb(event.currentTarget.checked), "Do not disturb updated.")
                }
                type="checkbox"
              />
              Do not disturb
            </label>
          </div>
        </>
      ) : null}
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
