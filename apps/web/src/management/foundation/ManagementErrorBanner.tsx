import type { ActionableManagementError } from "@stream-jams/core";
import { formatDateTime } from "./formatters.js";

export function ManagementErrorBanner({ error }: { readonly error: ActionableManagementError }) {
  const cause = formatCause(error.cause);
  return (
    <section className={`management-error-banner management-error-banner--${error.severity}`} role="alert">
      <div>
        <strong>{error.summary}</strong>
        {cause === null ? null : <p>{cause}</p>}
        <p><span className="management-error-banner__label">Next step:</span> {error.nextStep}</p>
      </div>
      <div className="management-error-banner__meta">
        {error.occurredAt === null ? null : <time dateTime={error.occurredAt}>{formatDateTime(error.occurredAt)}</time>}
        {error.referenceId === null ? null : <code>{error.referenceId}</code>}
        {error.correction === null ? null : <a href={error.correction.route}>{error.correction.label}</a>}
      </div>
    </section>
  );
}

function formatCause(cause: string | null): string | null {
  if (cause === null || (!cause.startsWith("[") && !cause.startsWith("{"))) return cause;
  try {
    const parsed = JSON.parse(cause) as unknown;
    const issues = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "issues" in parsed && Array.isArray(parsed.issues)
        ? parsed.issues
        : [];
    const messages = issues.flatMap((issue) => {
      if (typeof issue !== "object" || issue === null || !("message" in issue) || typeof issue.message !== "string") return [];
      const path = "path" in issue && Array.isArray(issue.path) ? issue.path.map(String).join(".") : "";
      return [`${path === "" ? "" : `${path}: `}${issue.message}`];
    });
    return messages.length === 0 ? null : messages.join(" ");
  } catch {
    return cause;
  }
}
