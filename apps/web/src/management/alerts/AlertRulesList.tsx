import type { AlertRule } from "../modules/alerts/alert-api.js";

export interface AlertRulesListProps {
  readonly rules: readonly AlertRule[];
  readonly disabled: boolean;
  onToggle(ruleId: string, enabled: boolean): void;
}

export function AlertRulesList({ rules, disabled, onToggle }: AlertRulesListProps) {
  if (rules.length === 0) {
    return <p className="management-empty">No alert rules configured.</p>;
  }

  return (
    <div className="management-table-wrap">
      <table className="management-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Event</th>
            <th>Collections</th>
            <th>Variants</th>
            <th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.name}</td>
              <td>{formatEventType(rule.eventType)}</td>
              <td>{rule.collectionIds.length}</td>
              <td>{rule.variants.length}</td>
              <td>
                <label className="management-toggle">
                  <input
                    checked={rule.enabled}
                    disabled={disabled}
                    onChange={(event) => onToggle(rule.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatEventType(eventType: string): string {
  return eventType.replaceAll("_", " ");
}
