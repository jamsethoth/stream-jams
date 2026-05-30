import type { AlertCollection } from "../modules/alerts/alert-api.js";

export interface AlertCollectionsListProps {
  readonly collections: readonly AlertCollection[];
  readonly disabled: boolean;
  onToggle(collectionId: string, enabled: boolean): void;
}

export function AlertCollectionsList({ collections, disabled, onToggle }: AlertCollectionsListProps) {
  if (collections.length === 0) {
    return <p className="management-empty">No alert collections configured.</p>;
  }

  return (
    <div className="management-table-wrap">
      <table className="management-table">
        <thead>
          <tr>
            <th>Collection</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {collections.map((collection) => (
            <tr key={collection.id}>
              <td>{collection.name}</td>
              <td>
                <label className="management-toggle">
                  <input
                    checked={collection.enabled}
                    disabled={disabled}
                    onChange={(event) => onToggle(collection.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>{collection.enabled ? "Active" : "Inactive"}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
