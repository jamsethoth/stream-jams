import { useEffect, useState, type CSSProperties } from "react";
import { formatTimerRemaining, timerProfileDimensions, type TimerOverlayCard, type TimerStackProjection } from "@stream-jams/core";
import "../overlay.css";

export interface TimerStackProps {
  readonly stack: TimerStackProjection;
  readonly resolveAssetUrl: (assetId: string, version?: string) => string | null;
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
  const overflowPosition = stack.region.orientation === "vertical"
    ? { left: region.x, top: region.y + region.height }
    : { left: region.x + region.width, top: region.y };
  const vertical = stack.region.orientation === "vertical";
  const overflowSlot = { ...region,
    width: vertical ? region.width : region.width / stack.region.maxVisible,
    height: vertical ? region.height / stack.region.maxVisible : region.height };
  const overflowFontSize = scaleMeasurement(overflowSlot, 0.24, 0.08, 10, 42);
  const overflowBlockPadding = scaleMeasurement(overflowSlot, 0.06, 0.018, 3, 10);
  const overflowInlinePadding = scaleMeasurement(overflowSlot, 0.1, 0.03, 5, 16);
  const overflowOffset = scaleMeasurement(overflowSlot, 0.08, 0.025, 4, 14);
  const overflowWidth = overflowFontSize * 8 + overflowInlinePadding * 2 + 2;
  const overflowHeight = overflowFontSize + overflowBlockPadding * 2 + 2;
  const bounds = timerProfileDimensions[stack.targetProfileId];
  // Reserve the same badge footprint even without overflow, so starting another
  // timer never resizes the fixed-capacity slots. Scale only at profile edges.
  const scale = Math.min(1,
    (bounds.width - region.x) / (vertical ? Math.max(region.width, overflowWidth) : region.width + overflowOffset + overflowWidth),
    (bounds.height - region.y) / (vertical ? region.height + overflowOffset + overflowHeight : Math.max(region.height, overflowHeight)));
  const overflowStyle = {
    "--timer-overflow-block-padding": `${overflowBlockPadding}px`,
    "--timer-overflow-font-size": `${overflowFontSize}px`,
    "--timer-overflow-inline-padding": `${overflowInlinePadding}px`,
    "--timer-overflow-offset": `${overflowOffset}px`,
    maxWidth: `${overflowWidth}px`,
    height: `${overflowHeight}px`,
    left: `${overflowPosition.left}px`,
    top: `${overflowPosition.top}px`,
    zIndex: region.zIndex + 1
  } as CSSProperties;
  return (
    <div className="timer-stack" style={{ transform: `scale(${scale})`, transformOrigin: `${region.x}px ${region.y}px` }}>
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
          className={`timer-stack__overflow timer-stack__overflow--${stack.region.orientation}`}
          style={overflowStyle}
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
  readonly resolveAssetUrl: (assetId: string, version?: string) => string | null;
}) {
  const remainingMs = card.status === "running"
    ? Math.max(0, card.endsAtEpochMs - nowEpochMs)
    : card.status === "paused" ? card.remainingMs : 0;
  const value = formatTimerRemaining(remainingMs);
  const labelSize = scaleMeasurement(card.slot, 0.24, 0.08, 10, 42);
  const valueSize = scaleMeasurement(card.slot, 0.29, 0.12, 12, 56);
  const iconSize = scaleMeasurement(card.slot, 0.48, 0.16, 16, 64);
  const style = {
    "--timer-card-block-padding": `${scaleMeasurement(card.slot, 0.1, 0.025, 4, 16)}px`,
    "--timer-card-gap": `${scaleMeasurement(card.slot, 0.12, 0.025, 4, 18)}px`,
    "--timer-card-inline-padding": `${scaleMeasurement(card.slot, 0.14, 0.04, 6, 24)}px`,
    "--timer-card-radius": `${scaleMeasurement(card.slot, 0.12, 0.03, 4, 16)}px`,
    "--timer-icon-size": `${iconSize}px`,
    "--timer-label-size": `${labelSize}px`,
    "--timer-value-size": `${valueSize}px`,
    height: `${card.slot.height}px`,
    left: `${card.slot.x}px`,
    top: `${card.slot.y}px`,
    width: `${card.slot.width}px`,
    zIndex: card.slot.zIndex
  } as CSSProperties;
  return (
    <div
      aria-label={`${card.label}, ${card.status}, ${value}`}
      className={`timer-stack__card timer-stack__card--${card.status}`}
      data-timer-id={card.definitionId}
      role="listitem"
      style={style}
    >
      {card.iconAssetId === null
        ? <DefaultTimerIcon />
        : <TimerIcon version={card.iconVersion} assetId={card.iconAssetId} label={card.label} resolveAssetUrl={resolveAssetUrl} />}
      <span className="timer-stack__label" title={card.label}>{card.label}</span>
      <time className="timer-stack__value" data-testid={`timer-value-${card.definitionId}`}>{value}</time>
    </div>
  );
}

function scaleMeasurement(
  slot: TimerOverlayCard["slot"],
  heightRatio: number,
  widthRatio: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Math.min(slot.height * heightRatio, slot.width * widthRatio))));
}

function DefaultTimerIcon() {
  return (
    <svg aria-label="Default timer icon" className="timer-stack__icon timer-stack__icon--default" role="img" viewBox="0 0 64 64">
      <circle cx="32" cy="34" fill="none" r="23" stroke="currentColor" strokeWidth="6" />
      <path d="M24 5h16M32 11v7M49 17l5 5M32 34V22M32 34l10 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="6" />
    </svg>
  );
}

function TimerIcon({
  version,
  assetId,
  label,
  resolveAssetUrl
}: {
  readonly version: string | undefined;
  readonly assetId: string;
  readonly label: string;
  readonly resolveAssetUrl: (assetId: string, version?: string) => string | null;
}) {
  const [failed, setFailed] = useState(false);
  const src = resolveAssetUrl(assetId, version);
  useEffect(() => setFailed(false), [assetId, src]);
  if (failed || src === null) return null;
  return (
    <img
      referrerPolicy="no-referrer"
      alt={`${label} icon`}
      className="timer-stack__icon"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
