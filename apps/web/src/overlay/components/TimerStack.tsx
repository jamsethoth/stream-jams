import { useEffect, useState, type CSSProperties } from "react";
import { formatTimerRemaining, type TimerOverlayCard, type TimerStackProjection } from "@stream-jams/core";
import "../overlay.css";

export interface TimerStackProps {
  readonly stack: TimerStackProjection;
  readonly resolveAssetUrl: (assetId: string) => string;
  readonly now?: () => number;
}

const systemNow = () => Date.now();

export function TimerStack({ stack, resolveAssetUrl, now = systemNow }: TimerStackProps) {
  const hasRunning = stack.cards.some(card => card.status === "running");
  const [nowEpochMs, setNowEpochMs] = useState(() => now());
  useEffect(() => {
    setNowEpochMs(now());
    if (!hasRunning) return;
    const interval = window.setInterval(() => setNowEpochMs(now()), 250);
    return () => window.clearInterval(interval);
  }, [hasRunning, now, stack.cards]);

  const region = stack.region.layout;
  return (
    <div className="timer-stack">
      <div aria-label="Active timers" className="timer-stack__items" data-orientation={stack.region.orientation} role="list">
        {stack.cards.map(card => (
          <TimerCard
            card={card}
            key={`${card.definitionId}:${card.generation}`}
            nowEpochMs={nowEpochMs}
            resolveAssetUrl={resolveAssetUrl}
          />
        ))}
      </div>
      {stack.overflowCount === 0 ? null : (
        <div
          aria-label={`${stack.overflowCount} more active timers`}
          className="timer-stack__overflow"
          style={{ left: `${region.x + region.width}px`, top: `${region.y}px`, zIndex: region.zIndex + 1 }}
        >
          +{stack.overflowCount} more
        </div>
      )}
    </div>
  );
}

function TimerCard({
  card,
  nowEpochMs,
  resolveAssetUrl
}: {
  readonly card: TimerOverlayCard;
  readonly nowEpochMs: number;
  readonly resolveAssetUrl: (assetId: string) => string;
}) {
  const remainingMs = card.status === "running"
    ? Math.max(0, card.endsAtEpochMs - nowEpochMs)
    : card.status === "paused" ? card.remainingMs : 0;
  const value = formatTimerRemaining(remainingMs);
  const style: CSSProperties = {
    height: `${card.slot.height}px`,
    left: `${card.slot.x}px`,
    top: `${card.slot.y}px`,
    width: `${card.slot.width}px`,
    zIndex: card.slot.zIndex
  };
  return (
    <div
      aria-label={`${card.label}, ${card.status}, ${value}`}
      className={`timer-stack__card timer-stack__card--${card.status}`}
      data-timer-id={card.definitionId}
      role="listitem"
      style={style}
    >
      {card.iconAssetId === null ? null : (
        <TimerIcon assetId={card.iconAssetId} label={card.label} resolveAssetUrl={resolveAssetUrl} />
      )}
      <span className="timer-stack__label" title={card.label}>{card.label}</span>
      <time className="timer-stack__value" data-testid={`timer-value-${card.definitionId}`}>{value}</time>
    </div>
  );
}

function TimerIcon({
  assetId,
  label,
  resolveAssetUrl
}: {
  readonly assetId: string;
  readonly label: string;
  readonly resolveAssetUrl: (assetId: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      alt={`${label} icon`}
      className="timer-stack__icon"
      onError={() => setFailed(true)}
      src={resolveAssetUrl(assetId)}
    />
  );
}
