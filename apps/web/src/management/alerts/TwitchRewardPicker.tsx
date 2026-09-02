import type {
  ChannelPointRewardSelection,
  TwitchCustomReward,
  TwitchCustomRewardCatalog
} from "@stream-jams/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ManagementHttpError } from "../management-http-client.js";
import "./twitch-reward-picker.css";

export interface TwitchRewardSampleChoice {
  readonly rewardId: string;
  readonly rewardTitle: string;
}

export interface TwitchRewardPickerProps {
  readonly selection: ChannelPointRewardSelection;
  readonly loadRewards: () => Promise<TwitchCustomRewardCatalog>;
  readonly onChange: (selection: ChannelPointRewardSelection) => void;
  readonly disabled?: boolean;
  readonly overlapAlertNames?: readonly string[];
  readonly sampleRewardId?: string;
  readonly onUseAsSample?: (sample: TwitchRewardSampleChoice) => void;
}

type CatalogRequestState =
  | { readonly status: "loading"; readonly rewards: readonly TwitchCustomReward[] }
  | { readonly status: "loaded"; readonly rewards: readonly TwitchCustomReward[] }
  | { readonly status: "error"; readonly rewards: readonly TwitchCustomReward[]; readonly error: unknown };

interface CatalogErrorPresentation {
  readonly summary: string;
  readonly nextStep: string;
  readonly showEventSourcesLink: boolean;
  readonly referenceId: string | null;
}

export function TwitchRewardPicker({
  disabled = false,
  loadRewards,
  onChange,
  onUseAsSample,
  overlapAlertNames = [],
  sampleRewardId,
  selection
}: TwitchRewardPickerProps) {
  const pickerId = useId();
  const requestGenerationRef = useRef(0);
  const defaultedSampleRef = useRef<string | null>(null);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [request, setRequest] = useState<CatalogRequestState>({ status: "loading", rewards: [] });

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    setRequest((current) => ({ status: "loading", rewards: current.rewards }));

    void loadRewards().then((catalog) => {
      if (requestGenerationRef.current !== requestGeneration) return;
      setRequest({ status: "loaded", rewards: catalog.rewards });
    }).catch((error: unknown) => {
      if (requestGenerationRef.current !== requestGeneration) return;
      setRequest((current) => ({ status: "error", rewards: current.rewards, error }));
    });

    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [loadRewards, refreshGeneration]);

  const rewardById = useMemo(
    () => new Map(request.rewards.map((reward) => [reward.id, reward])),
    [request.rewards]
  );
  const selectedRewardIds = selection.mode === "selected" ? selection.rewardIds : [];
  const missingRewardIds = selectedRewardIds.filter((rewardId) => !rewardById.has(rewardId));
  const firstSelectedId = selectedRewardIds[0] ?? null;
  const sampleIsSelected = sampleRewardId !== undefined && selectedRewardIds.includes(sampleRewardId);
  const requestSettled = request.status !== "loading";
  const firstSelectedTitle = firstSelectedId === null
    ? null
    : rewardById.get(firstSelectedId)?.title ?? "Unavailable reward";

  useEffect(() => {
    if (
      !requestSettled
      || selection.mode !== "selected"
      || firstSelectedId === null
      || firstSelectedTitle === null
      || sampleIsSelected
      || onUseAsSample === undefined
    ) {
      if (sampleIsSelected) defaultedSampleRef.current = null;
      return;
    }

    const defaultKey = `${sampleRewardId ?? ""}\u0000${firstSelectedId}`;
    if (defaultedSampleRef.current === defaultKey) return;
    defaultedSampleRef.current = defaultKey;
    onUseAsSample({ rewardId: firstSelectedId, rewardTitle: firstSelectedTitle });
  }, [firstSelectedId, firstSelectedTitle, onUseAsSample, requestSettled, sampleIsSelected, sampleRewardId, selection.mode]);

  function setMode(mode: ChannelPointRewardSelection["mode"]) {
    if (mode === "all") {
      onChange({ mode: "all" });
      return;
    }
    onChange({ mode: "selected", rewardIds: [] });
  }

  function toggleReward(rewardId: string) {
    const currentIds = selection.mode === "selected" ? selection.rewardIds : [];
    onChange({
      mode: "selected",
      rewardIds: currentIds.includes(rewardId)
        ? currentIds.filter((candidate) => candidate !== rewardId)
        : [...currentIds, rewardId]
    });
  }

  function refreshRewards() {
    setRefreshGeneration((current) => current + 1);
  }

  const requestDisabled = disabled || request.status === "loading";

  return (
    <section className="twitch-reward-picker" aria-busy={request.status === "loading"} aria-labelledby={`${pickerId}-heading`}>
      <header className="twitch-reward-picker__header">
        <div>
          <h3 id={`${pickerId}-heading`}>Custom Twitch rewards</h3>
          <p>Choose which stable reward IDs can trigger this shared alert.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={requestDisabled}
          onClick={refreshRewards}
          type="button"
        >
          Refresh rewards
        </button>
      </header>

      <fieldset className="twitch-reward-picker__coverage">
        <legend>Reward coverage</legend>
        <label>
          <input
            aria-describedby={`${pickerId}-all-description`}
            aria-label="Every custom reward, including future rewards"
            checked={selection.mode === "all"}
            disabled={disabled}
            name={`${pickerId}-coverage`}
            onChange={() => setMode("all")}
            type="radio"
          />
          <span>
            <strong>Every custom reward, including future rewards</strong>
            <small id={`${pickerId}-all-description`}>No reward condition is saved.</small>
          </span>
        </label>
        <label>
          <input
            aria-describedby={`${pickerId}-selected-description`}
            aria-label="Selected rewards"
            checked={selection.mode === "selected"}
            disabled={disabled}
            name={`${pickerId}-coverage`}
            onChange={() => setMode("selected")}
            type="radio"
          />
          <span>
            <strong>Selected rewards</strong>
            <small id={`${pickerId}-selected-description`}>Only the saved reward IDs match.</small>
          </span>
        </label>
      </fieldset>

      {selection.mode === "selected" && selectedRewardIds.length === 0 ? (
        <p className="twitch-reward-picker__validation">Select at least one reward before saving this alert.</p>
      ) : null}

      {overlapAlertNames.length === 0 ? null : (
        <div className="twitch-reward-picker__warning" aria-label="Potential overlapping alerts" role="note">
          <strong>These alerts may also play for the same reward:</strong>{" "}
          {overlapAlertNames.join(", ")}.
        </div>
      )}

      <CatalogRequestMessage request={request} onRetry={refreshRewards} retryDisabled={requestDisabled} />

      <div className="twitch-reward-picker__actions">
        <button
          className="button button--secondary"
          disabled={disabled || request.rewards.length === 0}
          onClick={() => onChange({ mode: "selected", rewardIds: request.rewards.map((reward) => reward.id) })}
          type="button"
        >
          Select all currently listed
        </button>
        <button
          className="button button--secondary"
          disabled={disabled || (selection.mode === "selected" && selectedRewardIds.length === 0)}
          onClick={() => onChange({ mode: "selected", rewardIds: [] })}
          type="button"
        >
          Clear selection
        </button>
      </div>

      {missingRewardIds.length === 0 && request.rewards.length === 0 ? null : (
        <ul className="twitch-reward-picker__rewards" aria-label="Custom Twitch rewards">
          {missingRewardIds.map((rewardId) => (
            <RewardRow
              disabled={disabled}
              key={rewardId}
              onToggle={() => toggleReward(rewardId)}
              onUseAsSample={onUseAsSample}
              rewardId={rewardId}
              selected
            />
          ))}
          {request.rewards.map((reward) => (
            <RewardRow
              disabled={disabled}
              key={reward.id}
              onToggle={() => toggleReward(reward.id)}
              onUseAsSample={onUseAsSample}
              reward={reward}
              rewardId={reward.id}
              selected={selection.mode === "selected" && selectedRewardIds.includes(reward.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CatalogRequestMessage({
  onRetry,
  request,
  retryDisabled
}: {
  readonly onRetry: () => void;
  readonly request: CatalogRequestState;
  readonly retryDisabled: boolean;
}) {
  if (request.status === "loading") {
    return <p className="twitch-reward-picker__request" role="status">Loading Twitch rewards...</p>;
  }
  if (request.status === "loaded") {
    return request.rewards.length === 0
      ? <p className="twitch-reward-picker__request" role="status">No custom rewards are available for this channel.</p>
      : <p className="twitch-reward-picker__request" role="status">
          {request.rewards.length} custom {request.rewards.length === 1 ? "reward" : "rewards"} loaded.
        </p>;
  }

  const presentation = catalogErrorPresentation(request.error);
  return (
    <div className="twitch-reward-picker__error" role="alert">
      <strong>{presentation.summary}</strong>
      <p>{presentation.nextStep}</p>
      {presentation.referenceId === null ? null : <p>Reference: {presentation.referenceId}</p>}
      <div className="twitch-reward-picker__error-actions">
        {presentation.showEventSourcesLink ? <a href="/manage/event-sources">Open Event sources</a> : null}
        <button className="button button--secondary" disabled={retryDisabled} onClick={onRetry} type="button">
          Retry rewards
        </button>
      </div>
    </div>
  );
}

function RewardRow({
  disabled,
  onToggle,
  onUseAsSample,
  reward,
  rewardId,
  selected
}: {
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onUseAsSample: TwitchRewardPickerProps["onUseAsSample"];
  readonly reward?: TwitchCustomReward;
  readonly rewardId: string;
  readonly selected: boolean;
}) {
  const title = reward?.title ?? "Unavailable reward";
  const sampleLabel = reward === undefined
    ? `Use Unavailable reward ${rewardId} as sample`
    : `Use ${reward.title} as sample`;
  const statuses = reward === undefined ? [] : rewardStatuses(reward);

  return (
    <li className={`twitch-reward-picker__reward${reward === undefined ? " twitch-reward-picker__reward--unavailable" : ""}`}>
      <label>
        <input checked={selected} disabled={disabled} onChange={onToggle} type="checkbox" />
        <span className="twitch-reward-picker__reward-copy">
          <strong>{title}</strong>
          {reward === undefined ? (
            <small>{rewardId}</small>
          ) : (
            <>
              <small>{reward.cost.toLocaleString()} points</small>
              {reward.prompt === "" ? null : <small>{reward.prompt}</small>}
            </>
          )}
          {statuses.length === 0 ? null : (
            <span className="twitch-reward-picker__statuses">
              {statuses.map((status) => <span key={status}>{status}</span>)}
            </span>
          )}
        </span>
      </label>
      {!selected || onUseAsSample === undefined ? null : (
        <button
          className="button button--secondary twitch-reward-picker__sample"
          disabled={disabled}
          onClick={() => onUseAsSample({ rewardId, rewardTitle: title })}
          type="button"
          aria-label={sampleLabel}
        >
          Use as sample
        </button>
      )}
    </li>
  );
}

function rewardStatuses(reward: TwitchCustomReward): string[] {
  const statuses: string[] = [];
  if (!reward.isEnabled) statuses.push("Disabled");
  if (reward.isPaused) statuses.push("Paused");
  if (!reward.isInStock) statuses.push("Out of stock");
  if (reward.isUserInputRequired) statuses.push("Requires user input");
  return statuses;
}

function catalogErrorPresentation(error: unknown): CatalogErrorPresentation {
  const code = error instanceof ManagementHttpError ? error.code : null;
  const referenceId = error instanceof ManagementHttpError ? error.referenceId : null;

  switch (code) {
    case "TWITCH_REWARD_CATALOG_DISCONNECTED":
      return {
        summary: "Twitch is not connected",
        nextStep: "Open Event sources and connect Twitch.",
        showEventSourcesLink: true,
        referenceId
      };
    case "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED":
      return {
        summary: "Twitch permission update required",
        nextStep: "Reconnect Twitch from Event sources.",
        showEventSourcesLink: true,
        referenceId
      };
    case "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED":
      return {
        summary: "Twitch authorization expired",
        nextStep: "Reconnect Twitch, then retry.",
        showEventSourcesLink: true,
        referenceId
      };
    case "TWITCH_REWARD_CATALOG_INELIGIBLE":
      return {
        summary: "Custom rewards are unavailable for this channel",
        nextStep: "Confirm that the channel is eligible for custom rewards as a Twitch Affiliate or Partner.",
        showEventSourcesLink: false,
        referenceId
      };
    default:
      return {
        summary: "Twitch rewards could not be loaded",
        nextStep: "Retry the request; existing reward IDs remain editable.",
        showEventSourcesLink: false,
        referenceId
      };
  }
}
