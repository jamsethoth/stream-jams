import type { ProviderPageApi } from "./ProviderPage.js";
import { ProviderPage } from "./ProviderPage.js";

export interface TtsProvidersPageProps {
  readonly initialProviderId?: string | undefined;
  readonly managementApi: ProviderPageApi;
  readonly openSetupOnLoad?: boolean | undefined;
}

export function TtsProvidersPage({ initialProviderId, managementApi, openSetupOnLoad }: TtsProvidersPageProps) {
  return <ProviderPage capability="tts" initialProviderId={initialProviderId} managementApi={managementApi} openSetupOnLoad={openSetupOnLoad} />;
}
