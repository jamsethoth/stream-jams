import type { ProviderPageApi } from "./ProviderPage.js";
import { ProviderPage } from "./ProviderPage.js";

export interface EventSourcesPageProps {
  readonly managementApi: ProviderPageApi;
}

export function EventSourcesPage({ managementApi }: EventSourcesPageProps) {
  return <ProviderPage capability="event-source" managementApi={managementApi} />;
}
