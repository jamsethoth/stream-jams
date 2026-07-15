import type { ProviderPageApi } from "./ProviderPage.js";
import { ProviderPage } from "./ProviderPage.js";

export interface EventSourcesPageProps {
  readonly initialProviderId?: string | undefined;
  readonly managementApi: ProviderPageApi;
  readonly openSetupOnLoad?: boolean | undefined;
}

export function EventSourcesPage({ initialProviderId, managementApi, openSetupOnLoad }: EventSourcesPageProps) {
  return <ProviderPage capability="event-source" initialProviderId={initialProviderId} managementApi={managementApi} openSetupOnLoad={openSetupOnLoad} />;
}
