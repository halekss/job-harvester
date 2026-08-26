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
      className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-md border border-accent bg-surface-raised text-sm shadow-accent animate-[bar-rise_150ms_ease-out]"
    >
      <span aria-live="polite" className="font-medium text-text">
        {selectedCount} offre(s) sélectionnée(s)
      </span>
      <button
        type="button"
        onClick={onMarkFollowedUp}
        disabled={disabled}
        className="px-3 py-1 rounded-sm bg-accent text-background font-medium transition-colors duration-150 hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cool"
      >
        Marquer comme relancé
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="px-3 py-1 rounded-sm border border-border text-text transition-colors duration-150 hover:border-accent-cool focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
      >
        Désélectionner
      </button>
    </div>
  );
}
