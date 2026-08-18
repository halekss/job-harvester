import type { OfferFilters } from "../api/client.js";

const CONTRACT_TYPES = ["apprentissage", "professionnalisation", "stage", "autre"];

interface FilterBarProps {
  filters: OfferFilters;
  onChange: (next: OfferFilters | ((current: OfferFilters) => OfferFilters)) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const hasActiveFilters = Boolean(filters.q || filters.city || filters.contractType);

  return (
    <form
      role="search"
      aria-label="Filtrer les offres"
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-wrap items-end gap-3 mb-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-q" className="text-xs text-[var(--color-text-muted)]">
          Recherche
        </label>
        <input
          id="filter-q"
          type="text"
          value={filters.q ?? ""}
          onChange={(event) => onChange((current) => ({ ...current, q: event.target.value || undefined }))}
          placeholder="Titre…"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-city" className="text-xs text-[var(--color-text-muted)]">
          Ville
        </label>
        <input
          id="filter-city"
          type="text"
          value={filters.city ?? ""}
          onChange={(event) => onChange((current) => ({ ...current, city: event.target.value || undefined }))}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-contract" className="text-xs text-[var(--color-text-muted)]">
          Contrat
        </label>
        <select
          id="filter-contract"
          value={filters.contractType ?? ""}
          onChange={(event) => onChange((current) => ({ ...current, contractType: event.target.value || undefined }))}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <option value="">Tous</option>
          {CONTRACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"
        >
          Réinitialiser
        </button>
      )}
    </form>
  );
}
