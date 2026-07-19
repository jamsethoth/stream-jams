import type { ActionableManagementError } from "@stream-jams/core";

export function ManagementErrorBanner({ error }: { readonly error: ActionableManagementError }) {
  return (
    <section className={`management-error-banner management-error-banner--${error.severity}`} role="alert">
      <div>
        <strong>{error.summary}</strong>
        {error.cause === null ? null : <p>{error.cause}</p>}
        <p><span className="management-error-banner__label">Next step:</span> {error.nextStep}</p>
      </div>
      <div className="management-error-banner__meta">
        {error.occurredAt === null ? null : <time dateTime={error.occurredAt}>{new Date(error.occurredAt).toLocaleString()}</time>}
        {error.referenceId === null ? null : <code>{error.referenceId}</code>}
        {error.correction === null ? null : <a href={error.correction.route}>{error.correction.label}</a>}
      </div>
    </section>
  );
}
