import type { ProviderPageApi } from "./ProviderPage.js";
import { ProviderPage } from "./ProviderPage.js";

export interface TtsProvidersPageProps {
  readonly managementApi: ProviderPageApi;
}

export function TtsProvidersPage({ managementApi }: TtsProvidersPageProps) {
  return <ProviderPage capability="tts" managementApi={managementApi} />;
}
