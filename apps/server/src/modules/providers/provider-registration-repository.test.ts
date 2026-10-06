import { expectTypeOf, it } from "vitest";
import type { ProviderRegistrationRepository } from "./provider-registration-repository.js";

it("accepts a complete public-method substitute without SQLite identity", () => {
  const repository = {
    save: async (record: Parameters<ProviderRegistrationRepository["save"]>[0]) => record,
    delete: async () => {}, findById: async () => null, list: async () => [], findActive: async () => null,
    activate: async (): ReturnType<ProviderRegistrationRepository["activate"]> => { throw new Error("injected persistence failure"); },
    deactivateMusic: async () => null, updateTtsSafety: async () => null
  } satisfies ProviderRegistrationRepository;
  expectTypeOf(repository).toExtend<ProviderRegistrationRepository>();
});
