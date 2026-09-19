import type { ScreenEffectSet } from "@stream-jams/core";
import type { ScreenEffectsApi } from "../management/screen-effects/screen-effects-api.js";

export function createStoryEffectSets(effectIds: readonly string[] = []): Pick<ScreenEffectsApi, "listSets" | "createSet" | "renameSet" | "activateSet" | "removeSet"> {
  let sets: ScreenEffectSet[] = [{ id: "screen-effects-default", name: "Default", active: true, effectIds: [...effectIds] }];
  return {
    listSets: async () => structuredClone(sets),
    createSet: async (input) => {
      const set = { ...input, active: false, effectIds: [] };
      sets = [...sets, set];
      return set;
    },
    renameSet: async (id, name) => {
      const set = { ...sets.find((candidate) => candidate.id === id)!, name };
      sets = sets.map((candidate) => candidate.id === id ? set : candidate);
      return set;
    },
    activateSet: async (id) => { sets = sets.map((set) => ({ ...set, active: set.id === id })); },
    removeSet: async (id) => { sets = sets.filter((set) => set.id !== id); }
  };
}
