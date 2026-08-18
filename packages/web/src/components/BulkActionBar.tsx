interface BulkActionBarProps {
  selectedCount: number;
  onMarkFollowedUp: () => void;
  onClearSelection: () => void;
  disabled: boolean;
}

export function BulkActionBar({ selectedCount, onMarkFollowedUp, onClearSelection, disabled }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Actions groupées"
      className="flex items-center gap-3 mb-3 px-3 py-2 rounded border border-[var(--color-accent)] bg-[var(--color-surface)] text-sm"
    >
      <span aria-live="polite">{selectedCount} offre(s) sélectionnée(s)</span>
      <button
        type="button"
        onClick={onMarkFollowedUp}
        disabled={disabled}
        className="px-2 py-1 rounded bg-[var(--color-accent)] text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text)]"
      >
        Marquer comme relancé
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="px-2 py-1 rounded border border-[var(--color-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        Désélectionner
      </button>
    </div>
  );
}
