import { resolveAlertAudio } from "../audio/resolve-alert-audio.js";
import type { AlertEditorDocument, TargetProfileId } from "./contracts.js";

export type AlertConfigurationIssue = "empty-content" | "missing-profile" | "profile-review";

export interface AlertConfigurationAssessment {
  readonly hasBrowserContent: boolean;
  readonly hasDeviceAudio: boolean;
  readonly issue: AlertConfigurationIssue | null;
  readonly profileId: TargetProfileId | null;
}

export function assessAlertConfiguration(
  document: AlertEditorDocument,
  visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">> = {}
): AlertConfigurationAssessment {
  const audio = resolveAlertAudio(document, visualAssetMediaTypes);
  const enabledProfiles = document.targetProfiles.filter((profile) => profile.enabled);
  const hasVisibleVisual = document.layers.some((layer) => layer.visible && (
    layer.type === "text" || layer.type === "image" || layer.type === "video" || layer.type === "shape" || (layer.type === "tts" && layer.enabled)
  ));
  const hasBrowserPayload = hasVisibleVisual || audio?.outputs.browserSource === true;
  const hasBrowserContent = hasBrowserPayload && enabledProfiles.length > 0;
  const hasDeviceAudio = audio !== null && audio.outputs.deviceRouteIds.length > 0;

  if (hasBrowserPayload && enabledProfiles.length > 0) {
    const needsReview = enabledProfiles.find((profile) => profile.reviewState === "needs-review");
    if (needsReview !== undefined) return { hasBrowserContent, hasDeviceAudio, issue: "profile-review", profileId: needsReview.id };
    return { hasBrowserContent, hasDeviceAudio, issue: null, profileId: enabledProfiles[0]?.id ?? null };
  }

  if (hasDeviceAudio) return { hasBrowserContent, hasDeviceAudio, issue: null, profileId: null };
  if (hasBrowserPayload) return { hasBrowserContent, hasDeviceAudio, issue: "missing-profile", profileId: null };
  return { hasBrowserContent, hasDeviceAudio, issue: "empty-content", profileId: null };
}
