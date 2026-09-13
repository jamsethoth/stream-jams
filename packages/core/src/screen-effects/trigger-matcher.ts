import type { EffectBinding, EffectTrigger } from "./types.js";

export function matchesEffectBinding(binding: EffectBinding, trigger: EffectTrigger): boolean {
  if (binding.kind !== trigger.kind) {
    return false;
  }

  if (binding.kind === "twitch-reward" && trigger.kind === "twitch-reward") {
    return binding.broadcasterId === trigger.broadcasterId
      && binding.rewardId === trigger.rewardId;
  }

  if (binding.kind === "streamerbot-event" && trigger.kind === "streamerbot-event") {
    return binding.providerId === trigger.providerId
      && binding.sourceKey === trigger.sourceKey
      && binding.eventType === trigger.eventType;
  }

  return false;
}
