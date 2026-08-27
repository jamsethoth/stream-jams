import {
  alertStarterThemes,
  createAlertTemplateContext,
  targetProfileDefinitions,
  type AlertStarterThemeId,
  type StreamEventType
} from "@stream-jams/core";
import { useId } from "react";
import { AlertThemePreview } from "./AlertThemePreview.js";
import "./alert-theme-chooser.css";

export interface AlertThemeChooserProps {
  readonly disabled?: boolean;
  readonly eventType: StreamEventType;
  readonly onChange: (themeId: AlertStarterThemeId) => void;
  readonly value: AlertStarterThemeId;
}

const commonActor = { id: "starter-preview-user", displayName: "StreamSpark" } as const;
const commonSample = { actor: commonActor, userName: commonActor.displayName } as const;

const previewSamples = {
  follow: commonSample,
  subscription: { ...commonSample, amount: 1, tier: "1000" },
  resubscription: { ...commonSample, amount: 12, tier: "1000", streakMonths: 12, totalMonths: 12 },
  cheer: { ...commonSample, amount: 500, cheerAmount: 500, message: "What a moment!" },
  raid: { ...commonSample, amount: 125, raidViewers: 125 },
  channel_point_redemption: { ...commonSample, rewardTitle: "Highlight my message", userInput: "Hello, stream!" },
  gift_subscription: {
    ...commonSample,
    tier: "1000",
    recipient: { id: "starter-preview-recipient", displayName: "PixelPal" },
    recipientName: "PixelPal",
    gifter: commonActor
  },
  community_gift: { ...commonSample, amount: 5, giftCount: 5, tier: "1000", cumulativeTotal: 42 },
  hype_train_start: { ...commonSample, level: 1, progress: 50, goal: 100, total: 50 },
  hype_train_progress: { ...commonSample, level: 2, progress: 250, goal: 500, total: 250 },
  hype_train_end: { ...commonSample, level: 3, progress: 500, goal: 500, total: 500 },
  poll_start: { ...commonSample, title: "What should we play next?", totalVotes: 0, status: "active" },
  poll_progress: { ...commonSample, title: "What should we play next?", totalVotes: 250, status: "active" },
  poll_end: { ...commonSample, title: "What should we play next?", totalVotes: 500, status: "completed" },
  prediction_start: { ...commonSample, title: "Will we win?", totalPoints: 0, totalUsers: 0, status: "active" },
  prediction_progress: { ...commonSample, title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "active" },
  prediction_lock: { ...commonSample, title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "locked" },
  prediction_end: { ...commonSample, title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "resolved" },
  stream_online: { ...commonSample, streamType: "live" },
  stream_offline: commonSample
} as const satisfies Readonly<Record<StreamEventType, Readonly<Record<string, unknown>>>>;

export function AlertThemeChooser(props: AlertThemeChooserProps) {
  const chooserId = useId();
  const templateContext = createAlertTemplateContext({
    eventType: props.eventType,
    samplePayload: previewSamples[props.eventType]
  });

  return (
    <section className="alert-theme-chooser" aria-labelledby={`${chooserId}-heading`}>
      <div className="alert-theme-chooser__heading">
        <h3 id={`${chooserId}-heading`}>Starter theme</h3>
        <p>Choose an editable visual starting point. Both target profiles are included.</p>
      </div>
      <div aria-label="Starter theme" className="alert-theme-chooser__options" role="radiogroup">
        {alertStarterThemes.map((theme) => {
          const descriptionId = `${chooserId}-${theme.id}-description`;
          return (
            <label className="alert-theme-chooser__card" key={theme.id}>
              <span className="alert-theme-chooser__choice">
                <input
                  aria-describedby={descriptionId}
                  aria-label={theme.label}
                  checked={props.value === theme.id}
                  disabled={props.disabled}
                  name={`${chooserId}-starter-theme`}
                  onChange={(event) => {
                    if (event.currentTarget.checked) props.onChange(theme.id);
                  }}
                  type="radio"
                  value={theme.id}
                />
                <span>
                  <strong>{theme.label}</strong>
                  <span id={descriptionId}>{theme.description}</span>
                </span>
              </span>
              <span className="alert-theme-chooser__previews">
                {targetProfileDefinitions.map((profile) => (
                  <span className="alert-theme-chooser__preview" key={profile.id}>
                    <span>{profile.label}</span>
                    <AlertThemePreview
                      eventType={props.eventType}
                      profileId={profile.id}
                      templateContext={templateContext}
                      themeId={theme.id}
                      themeLabel={theme.label}
                    />
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
